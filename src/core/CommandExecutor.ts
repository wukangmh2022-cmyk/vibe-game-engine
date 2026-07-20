import {
  GameCommand,
  CommandType,
  CommandContext,
  CommandResult,
  ICommandHandler,
  ValidationResult,
  IEventManager,
  IStateManager,
  IResourceManager,
  IRendererManager,
  IAudioManager,
  ILogger
} from '../types';
import {
  cloneCommand,
  COMMAND_MODIFIER_FLAG,
  CommandModifierConfig,
  CommandModifierEntry,
  matchesModifierFilter,
  normalizeCommandKey
} from './commandModifiers';

/**
 * 指令执行器
 * 负责注册和执行各种游戏指令
 */
export class CommandExecutor {
  private handlers: Map<CommandType, ICommandHandler> = new Map();
  private executionQueue: GameCommand[] = [];
  private isExecuting: boolean = false;
  private context: CommandContext;
  private logger: ILogger;
  private commandModifiers: Map<string, CommandModifierEntry[]> = new Map();
  // Abort support
  private aborted: boolean = false;
  private abortables: Set<() => void> = new Set();

  constructor(
    stateManager: IStateManager,
    eventManager: IEventManager,
    resourceManager: IResourceManager,
    renderManager: IRendererManager,
    audioManager: IAudioManager,
    logger: ILogger
  ) {
    this.logger = logger;
    this.context = {
      gameState: stateManager.saveState(),
      stateManager,
      eventManager,
      resourceManager,
      renderManager,
      audioManager,
      logger,
      executor: this
    };

    // 注册默认指令处理器
    // this.registerDefaultHandlers();
  }

  // Abort all pending/ongoing execution and clear timeouts/listeners registered via registerAbortable
  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.clearQueue();
    const items = Array.from(this.abortables);
    this.abortables.clear();
    for (const fn of items) { if (fn) fn(); }
  }

  resetAbort(): void { this.aborted = false; }
  isAborted(): boolean { return this.aborted; }
  registerAbortable(fn: () => void): void {
    if (!fn) return;
    if (this.aborted) { fn(); return; }
    this.abortables.add(fn);
  }

  /**
   * 注册指令处理器
   */
  registerHandler(handler: ICommandHandler): void {
    if (this.handlers.has(handler.type)) {
      this.logger.warn(`Handler for command type '${handler.type}' already exists. Overriding.`);
    }
    
    this.handlers.set(handler.type, handler);
    this.logger.debug(`Registered handler for command type: ${handler.type}`);
  }

  /**
   * 移除指令处理器
   */
  unregisterHandler(type: CommandType): boolean {
    const removed = this.handlers.delete(type);
    if (removed) {
      this.logger.debug(`Unregistered handler for command type: ${type}`);
    }
    return removed;
  }

  setCommandModifiers(raw: CommandModifierConfig | Record<string, any> | null | undefined): void {
    this.commandModifiers.clear();
    if (!raw) return;
    Object.entries(raw).forEach(([key, entries]) => {
      const normalizedKey = normalizeCommandKey(key);
      if (!normalizedKey) return;
      const list = Array.isArray(entries) ? entries : [];
      const prepared = list.map((entry) => {
        if (!entry || !Array.isArray(entry.commands) || !entry.commands.length) return null;
        return {
          filter: entry.filter ? { ...entry.filter } : undefined,
          commands: entry.commands.map(cloneCommand)
        } as CommandModifierEntry;
      }).filter(Boolean) as CommandModifierEntry[];
      if (prepared.length) {
        this.commandModifiers.set(normalizedKey, prepared);
      }
    });
  }

  /**
   * 执行单个指令
   */
  async executeCommand(command: GameCommand): Promise<CommandResult> {
    const sm: any = (this.context as any).stateManager;
    const createdScope = sm && typeof sm.hasActiveTempScope === 'function' && !sm.hasActiveTempScope();
    if (createdScope && typeof sm.beginTempScope === 'function') {
      try { sm.beginTempScope(); } catch {}
    }
    if (this.aborted) {
      return { success: true, data: { aborted: true } } as CommandResult;
    }
    // 兼容大小写/命名风格：允许 JSON 中使用大写类型（如 "SHOW_TEXT"、"EMIT_SIGNAL"）
    let handler = this.handlers.get(command.type as any);
    if (!handler && typeof (command as any).type === 'string') {
      const original = String((command as any).type);
      const normalized = original.toLowerCase();

      // 生成候选键，尽可能匹配不同命名风格与别名
      const candidates: string[] = [normalized];

      // 如果不是以 show_ 开头，尝试映射为 show_* 形式
      if (!normalized.startsWith('show_')) {
        candidates.push(`show_${normalized}`);                // show_button -> 匹配内置处理器
        candidates.push(`SHOW_${normalized}`);                // SHOW_BUTTON -> 匹配测试里的 Mock
      }

      // 针对常见别名做显式映射
      const aliasMap: Record<string, string[]> = {
        // 简化别名
        button: ['show_button', 'SHOW_BUTTON'],
        choices: ['show_choices', 'SHOW_CHOICES'],
        text: ['show_text', 'SHOW_TEXT'],
        update_text: ['update_text', 'UPDATE_TEXT'],
        // 历史名称兼容
        call_event: ['emit_signal', 'EMIT_SIGNAL'],
        // 粒子/烟花 特效别名
        'fireworks': ['firework_burst'],
        'firework': ['firework_burst'],
        'particle_effect': ['firework_burst'],
        '粒子特效': ['firework_burst'],
        '烟花': ['firework_burst'],
      };
      if (aliasMap[normalized]) {
        candidates.push(...aliasMap[normalized]);
      }

      // 同时把原始（可能是大写）的也加入尝试
      candidates.push(original);

      // 逐个尝试匹配已注册的处理器
      for (const key of candidates) {
        handler = this.handlers.get(key as any);
        if (handler) break;
      }
    }

    if (!handler) {
       const error = `No handler found for command type: ${command.type}`;
       this.logger.error(error, { command });
       return {
         success: false,
         error
       };
     }

    // 验证指令
    const validation = handler.validate(command);
    if (!validation.valid) {
      const error = `Command validation failed: ${validation.errors.map(e => e.message).join(', ')}`;
      this.logger.error(error, { command, validation });
      return {
        success: false,
        error
      };
    }

    try {
      if (this.aborted) {
        return { success: true, data: { aborted: true } } as CommandResult;
      }
      this.logger.debug(`Executing command: ${command.type}`, { command });

      await this.runCommandModifiers(command);
      
      // 触发指令开始执行事件
      this.context.eventManager.emit('command_start', { command });
      
      const result = await handler.execute(command, this.context);
      
      // 触发指令执行完成事件
      this.context.eventManager.emit('command_complete', { command, result });
      
      this.logger.debug(`Command executed successfully: ${command.type}`, { result });
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Command execution failed: ${command.type}`, { command, error });
      
      // 触发指令执行失败事件
      this.context.eventManager.emit('command_error', { command, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      if (createdScope && typeof sm.endTempScope === 'function') {
        try { sm.endTempScope(); } catch {}
      }
    }
  }

  /**
   * 批量执行指令
   */
  async executeCommands(commands: GameCommand[], opts?: { instanceId?: number }): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    const realSM: any = (this.context as any).stateManager as any;
    const hasInst = realSM && typeof realSM.getCurrentInstanceId === 'function' && typeof realSM.newEventInstanceId === 'function';
    const inherited = hasInst ? realSM.getCurrentInstanceId() : null;
    const instanceId = (typeof inherited === 'number') ? inherited : (opts && typeof opts.instanceId === 'number') ? opts.instanceId : (hasInst ? 0 : null);

    // Build a stateManager proxy that always reads/writes to instanceId (0 for main flow)
    const smProxy: any = (() => {
      if (instanceId == null || !realSM) return realSM;
      const p: any = {};
      p.getVariable = (k: string) => realSM.getVariableFor ? realSM.getVariableFor(instanceId, k) : realSM.getVariable(k);
      p.getSwitch = (k: string) => realSM.getSwitchFor ? realSM.getSwitchFor(instanceId, k) : realSM.getSwitch(k);
      p.setTempVariable = (k: string, v: any) => realSM.setTempVariableFor ? realSM.setTempVariableFor(instanceId, k, v) : realSM.setTempVariable(k, v);
      p.setTempSwitch = (k: string, v: boolean) => realSM.setTempSwitchFor ? realSM.setTempSwitchFor(instanceId, k, v) : realSM.setTempSwitch(k, v);
      const passthrough = ['setVariable','setSwitch','saveState','loadState','reset','getAllVariables','getAllSwitches','setVariables','setSwitches','getTempValues','hasTemp','getTempSwitchValues','hasTempSwitch','getCurrentInstanceId'];
      for (const m of passthrough) { if (typeof realSM[m] === 'function') p[m] = realSM[m].bind(realSM); }
      return p;
    })();

    // Scoped executor to preserve same instanceId for nested calls
    const scopedExecutor: any = {
      executeCommands: (cmds: GameCommand[]) => this.executeCommands(cmds, { instanceId } as any),
      executeCommand: async (cmd: GameCommand) => {
        const r = await this.executeCommands([cmd], { instanceId } as any);
        return Array.isArray(r) && r.length ? r[0] : ({ success: true } as CommandResult);
      }
    };

    const localCtx: any = { ...this.context, stateManager: smProxy, executor: scopedExecutor };

    const runOne = async (command: GameCommand): Promise<CommandResult> => {
      if (this.aborted) return { success: true, data: { aborted: true } } as any;
      let handler = this.handlers.get(command.type as any);
      if (!handler && typeof (command as any).type === 'string') {
        const original = String((command as any).type);
        const normalized = original.toLowerCase();
        const candidates: string[] = [normalized];
        if (!normalized.startsWith('show_')) { candidates.push(`show_${normalized}`); candidates.push(`SHOW_${normalized}`); }
        const aliasMap: Record<string, string[]> = { button: ['show_button','SHOW_BUTTON'], choices: ['show_choices','SHOW_CHOICES'], text: ['show_text','SHOW_TEXT'], update_text: ['update_text','UPDATE_TEXT'], call_event: ['emit_signal','EMIT_SIGNAL'], 'fireworks':['firework_burst'],'firework':['firework_burst'],'particle_effect':['firework_burst'],'粒子特效':['firework_burst'],'烟花':['firework_burst'] };
        if (aliasMap[normalized]) candidates.push(...aliasMap[normalized]);
        candidates.push(original);
        for (const key of candidates) { handler = this.handlers.get(key as any); if (handler) break; }
      }
      if (!handler) { const error = `No handler found for command type: ${command.type}`; this.logger.error(error, { command }); return { success: false, error }; }
      const validation = handler.validate(command);
      if (!validation.valid) { const error = `Command validation failed: ${validation.errors.map(e => e.message).join(', ')}`; this.logger.error(error, { command, validation }); return { success: false, error }; }
      try {
        if (this.aborted) return { success: true, data: { aborted: true } } as any;
        this.logger.debug(`Executing command: ${command.type}`, { command });
        await this.runCommandModifiers(command, instanceId ?? undefined);
        localCtx.eventManager.emit('command_start', { command });
        const result = await handler.execute(command, localCtx);
        localCtx.eventManager.emit('command_complete', { command, result });
        this.logger.debug(`Command executed successfully: ${command.type}`, { result });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Command execution failed: ${command.type}`, { command, error });
        localCtx.eventManager.emit('command_error', { command, error: errorMessage });
        return { success: false, error: errorMessage };
      }
    };

    for (const command of commands) {
      if (this.aborted) break;
      const result = await runOne(command);
      results.push(result);
      if (!result.success && !command.metadata?.continueOnError) { this.logger.warn('Stopping command execution due to failure', { command, result }); break; }
      if (result.nextCommand) {
        if (this.aborted) break;
        const nextCommand = commands.find(cmd => cmd.id === result.nextCommand);
        if (nextCommand) { const nextResult = await runOne(nextCommand); results.push(nextResult); }
      }
    }
    return results;
  }

  /**
   * 添加指令到执行队列
   */
  queueCommand(command: GameCommand): void {
    this.executionQueue.push(command);
    this.logger.debug(`Command queued: ${command.type}`, { queueSize: this.executionQueue.length });
  }

  /**
   * 添加多个指令到执行队列
   */
  queueCommands(commands: GameCommand[]): void {
    this.executionQueue.push(...commands);
    this.logger.debug(`Commands queued: ${commands.length}`, { queueSize: this.executionQueue.length });
  }

  /**
   * 执行队列中的所有指令
   */
  async executeQueue(): Promise<CommandResult[]> {
    if (this.aborted) return [];
    if (this.isExecuting) {
      this.logger.warn('Command queue is already executing');
      return [];
    }

    this.isExecuting = true;
    const commands = [...this.executionQueue];
    this.executionQueue = [];
    
    try {
      this.logger.info(`Starting queue execution with ${commands.length} commands`);
      const results = await this.executeCommands(commands);
      this.logger.info(`Queue execution completed`);
      return results;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * 清空执行队列
   */
  clearQueue(): void {
    const queueSize = this.executionQueue.length;
    this.executionQueue = [];
    this.logger.debug(`Command queue cleared`, { clearedCommands: queueSize });
  }

  private async runCommandModifiers(command: GameCommand, instanceId?: number): Promise<void> {
    if (!this.commandModifiers.size) return;
    if ((command as any)?.[COMMAND_MODIFIER_FLAG]) return;
    const key = normalizeCommandKey(command.type as any);
    if (!key) return;
    const entries = this.commandModifiers.get(key);
    if (!entries || !entries.length) return;
    for (const entry of entries) {
      if (!matchesModifierFilter(command, entry.filter)) continue;
      const clones = entry.commands.map(src => {
        const cloned = cloneCommand(src);
        (cloned as any)[COMMAND_MODIFIER_FLAG] = true;
        if (!cloned.id) {
          const base = command.id || command.type || 'MODIFIER';
          cloned.id = `${base}_${Math.random().toString(36).slice(2, 8)}` as any;
        }
        return cloned;
      });
      if (!clones.length) continue;
      if (instanceId != null) {
        await this.executeCommands(clones, { instanceId });
      } else {
        await this.executeCommands(clones);
      }
    }
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    size: number;
    isExecuting: boolean;
    commands: GameCommand[];
  } {
    return {
      size: this.executionQueue.length,
      isExecuting: this.isExecuting,
      commands: [...this.executionQueue]
    };
  }

  /**
   * 更新执行上下文
   */
  updateContext(updates: Partial<CommandContext>): void {
    this.context = { ...this.context, ...updates };
    this.logger.debug('Command context updated');
  }

  /**
   * 获取已注册的处理器类型
   */
  getRegisteredHandlers(): CommandType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 检查是否有指定类型的处理器
   */
  hasHandler(type: CommandType): boolean {
    return this.handlers.has(type);
  }

  /**
   * 注册默认指令处理器
   */
  private registerDefaultHandlers(): void {
    // 这里可以注册一些基础的指令处理器
    // 具体的处理器实现将在单独的文件中定义
    
    this.logger.info('Default command handlers registered');
  }

  /**
   * 获取执行统计信息
   */
  getStats(): {
    registeredHandlers: number;
    queueSize: number;
    isExecuting: boolean;
    handlerTypes: CommandType[];
  } {
    return {
      registeredHandlers: this.handlers.size,
      queueSize: this.executionQueue.length,
      isExecuting: this.isExecuting,
      handlerTypes: this.getRegisteredHandlers()
    };
  }
}

/**
 * 基础指令处理器抽象类
 */
export abstract class BaseCommandHandler implements ICommandHandler {
  abstract readonly type: CommandType;

  abstract execute(command: GameCommand, context: CommandContext): Promise<CommandResult>;

  /**
   * 默认验证实现
   */
  validate(command: GameCommand): ValidationResult {
    const errors = [];

    // 检查指令类型（宽松匹配：支持大小写、简写与历史别名）
    const incomingRaw = typeof (command as any).type === 'string'
      ? String((command as any).type)
      : String(command.type as any);
    const incomingType = incomingRaw.toLowerCase();
    const expectedType = String(this.type as any);

    // 构建允许的等价类型集合
    const allowed: Set<string> = new Set([expectedType]);
    // show_* 指令允许简写为不带前缀
    if (expectedType.startsWith('show_')) {
      allowed.add(expectedType.replace(/^show_/, ''));
    }
    // 历史别名映射
    const aliasByExpected: Record<string, string[]> = {
      emit_signal: ['call_event'],
      show_text: ['text', 'update_text'],
      show_choices: ['choices'],
      show_button: ['button'],
      firework_burst: ['particle_effect', '粒子特效', 'firework', 'fireworks', '烟花'],
    };
    if (aliasByExpected[expectedType]) {
      for (const a of aliasByExpected[expectedType]) allowed.add(a);
    }

    if (!allowed.has(incomingType)) {
      errors.push({
        field: 'type',
        message: `Expected command type '${expectedType}', got '${incomingRaw}'`,
        code: 'INVALID_TYPE'
      });
    }

    // 检查必需参数
    const requiredParams = this.getRequiredParameters();
    for (const param of requiredParams) {
      if (!(param in command.parameters)) {
        errors.push({
          field: 'parameters',
          message: `Missing required parameter: ${param}`,
          code: 'MISSING_PARAMETER'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取必需参数列表
   * 子类可以重写此方法来定义必需参数
   */
  protected getRequiredParameters(): string[] {
    return [];
  }

  /**
   * 创建成功结果
   */
  protected createSuccessResult(data?: any, nextCommand?: string): CommandResult {
    return {
      success: true,
      data,
      nextCommand
    };
  }

  /**
   * 创建失败结果
   */
  protected createErrorResult(error: string): CommandResult {
    return {
      success: false,
      error
    };
  }
}
