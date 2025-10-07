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

  /**
   * 执行单个指令
   */
  async executeCommand(command: GameCommand): Promise<CommandResult> {
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
    }
  }

  /**
   * 批量执行指令
   */
  async executeCommands(commands: GameCommand[]): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    
    for (const command of commands) {
      if (this.aborted) break;
      const result = await this.executeCommand(command);
      results.push(result);
      
      // 如果指令执行失败且没有设置继续执行标志，停止执行
      if (!result.success && !command.metadata?.continueOnError) {
        this.logger.warn('Stopping command execution due to failure', { command, result });
        break;
      }
      
      // 如果指令指定了下一个指令，跳转执行
      if (result.nextCommand) {
        if (this.aborted) break;
        const nextCommand = commands.find(cmd => cmd.id === result.nextCommand);
        if (nextCommand) {
          const nextResult = await this.executeCommand(nextCommand);
          results.push(nextResult);
        }
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
