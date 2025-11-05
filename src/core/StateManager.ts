import { IStateManager, GameState, IEventManager } from '../types';

/**
 * 游戏状态管理器
 * 负责管理游戏变量、开关状态和状态持久化
 */
export class StateManager implements IStateManager {
  private variables: Map<string, any> = new Map();
  private switches: Map<string, boolean> = new Map();
  // Instance-local storage: each event instance has its own temp vars/switches
  private tempVarsByInstance: Map<number, Map<string, any>> = new Map();
  private tempSwitchesByInstance: Map<number, Map<string, boolean>> = new Map();
  private instanceStack: number[] = [];
  private nextInstanceId = 1;
  private currentInstanceOverride: number | null = null;
  private eventManager: IEventManager;
  private currentLevel: string = '';
  private score: number = 0;
  private progress: number = 0;

  constructor(eventManager: IEventManager) {
    this.eventManager = eventManager;
  }

  /**
   * 获取变量值
   */
  getVariable(key: string): any {
    // Only read from the current event instance; otherwise fallback to global
    const cur = this.getCurrentInstanceId();
    if (cur != null) {
      const m = this.tempVarsByInstance.get(cur);
      if (m && m.has(key)) {
        const v = m.get(key);
        try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_VAR_READ') === '1'; if (dbg) (console as any).info?.('[VAR_READ]', { instance: cur, key, value: v }); } catch {}
        return v;
      }
    }
    const v = this.variables.get(key);
    try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_VAR_READ') === '1'; if (dbg) (console as any).info?.('[VAR_READ]', { instance: cur, key, value: v }); } catch {}
    return v;
  }

  // Explicit instance helpers (for CommandExecutor's scoped calls)
  getVariableFor(instanceId: number, key: string): any {
    const m = this.tempVarsByInstance.get(instanceId);
    if (m && m.has(key)) return m.get(key);
    return this.variables.get(key);
  }
  getSwitchFor(instanceId: number, key: string): boolean {
    const m = this.tempSwitchesByInstance.get(instanceId);
    if (m && m.has(key)) return !!m.get(key);
    return this.switches.get(key) || false;
  }
  setTempVariableFor(instanceId: number, key: string, value: any): void {
    if (!this.tempVarsByInstance.has(instanceId)) this.tempVarsByInstance.set(instanceId, new Map());
    const m = this.tempVarsByInstance.get(instanceId)!;
    const oldValue = m.get(key);
    m.set(key, value);
    this.eventManager.emit('variable_changed', { key, oldValue, newValue: value, temporary: true });
  }
  setTempSwitchFor(instanceId: number, key: string, value: boolean): void {
    if (!this.tempSwitchesByInstance.has(instanceId)) this.tempSwitchesByInstance.set(instanceId, new Map());
    const m = this.tempSwitchesByInstance.get(instanceId)!;
    const oldValue = m.get(key);
    m.set(key, !!value);
    this.eventManager.emit('switch_changed', { key, oldValue, newValue: !!value, temporary: true });
  }

  /**
   * 设置变量值
   */
  setVariable(key: string, value: any): void {
    const oldValue = this.variables.get(key);
    this.variables.set(key, value);
    
    // 触发变量变化事件
    this.eventManager.emit('variable_changed', {
      key,
      oldValue,
      newValue: value
    });
  }

  /**
   * 获取开关状态
   */
  getSwitch(key: string): boolean {
    const cur = this.getCurrentInstanceId();
    if (cur != null) {
      const m = this.tempSwitchesByInstance.get(cur);
      if (m && m.has(key)) {
        const v = !!m.get(key);
        try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_VAR_READ') === '1'; if (dbg) (console as any).info?.('[SWITCH_READ]', { instance: cur, key, value: v }); } catch {}
        return v;
      }
    }
    const v = this.switches.get(key) || false;
    try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_VAR_READ') === '1'; if (dbg) (console as any).info?.('[SWITCH_READ]', { instance: cur, key, value: v }); } catch {}
    return v;
  }

  /**
   * 设置开关状态
   */
  setSwitch(key: string, value: boolean): void {
    const oldValue = this.switches.get(key);
    this.switches.set(key, value);
    
    // 触发开关变化事件
    this.eventManager.emit('switch_changed', {
      key,
      oldValue,
      newValue: value
    });
  }

  /**
   * 获取当前关卡
   */
  getCurrentLevel(): string {
    return this.currentLevel;
  }

  /**
   * 设置当前关卡
   */
  setCurrentLevel(levelId: string): void {
    const oldLevel = this.currentLevel;
    this.currentLevel = levelId;
    
    this.eventManager.emit('level_changed', {
      oldLevel,
      newLevel: levelId
    });
  }

  /**
   * 获取分数
   */
  getScore(): number {
    return this.score;
  }

  /**
   * 设置分数
   */
  setScore(score: number): void {
    const oldScore = this.score;
    this.score = score;
    
    this.eventManager.emit('score_changed', {
      oldScore,
      newScore: score
    });
  }

  /**
   * 增加分数
   */
  addScore(points: number): void {
    this.setScore(this.score + points);
  }

  /**
   * 获取进度
   */
  getProgress(): number {
    return this.progress;
  }

  /**
   * 设置进度
   */
  setProgress(progress: number): void {
    const oldProgress = this.progress;
    this.progress = Math.max(0, Math.min(100, progress));
    
    this.eventManager.emit('progress_changed', {
      oldProgress,
      newProgress: this.progress
    });
  }

  /**
   * 保存当前状态
   */
  saveState(): GameState {
    const state: GameState = {
      currentLevel: this.currentLevel,
      variables: Object.fromEntries(this.variables),
      switches: Object.fromEntries(this.switches),
      score: this.score,
      progress: this.progress,
      timestamp: Date.now()
    };

    this.eventManager.emit('state_saved', { state });
    return state;
  }

  /**
   * 加载状态
   */
  loadState(state: GameState): void {
    this.currentLevel = state.currentLevel;
    this.score = state.score;
    this.progress = state.progress;
    
    // 清空并重新设置变量
    this.variables.clear();
    Object.entries(state.variables).forEach(([key, value]) => {
      this.variables.set(key, value);
    });
    
    // 清空并重新设置开关
    this.switches.clear();
    Object.entries(state.switches).forEach(([key, value]) => {
      this.switches.set(key, value);
    });

    this.eventManager.emit('state_loaded', { state });
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.variables.clear();
    this.switches.clear();
    this.tempVarsByInstance.clear();
    this.tempSwitchesByInstance.clear();
    this.instanceStack = [];
    this.nextInstanceId = 1;
    this.currentLevel = '';
    this.score = 0;
    this.progress = 0;

    this.eventManager.emit('state_reset');
  }

  /**
   * 获取所有变量
   */
  getAllVariables(): Record<string, any> {
    return Object.fromEntries(this.variables);
  }

  /**
   * 获取所有开关
   */
  getAllSwitches(): Record<string, boolean> {
    return Object.fromEntries(this.switches);
  }

  /**
   * 批量设置变量
   */
  setVariables(variables: Record<string, any>): void {
    Object.entries(variables).forEach(([key, value]) => {
      this.setVariable(key, value);
    });
  }

  /**
   * 批量设置开关
   */
  setSwitches(switches: Record<string, boolean>): void {
    Object.entries(switches).forEach(([key, value]) => {
      this.setSwitch(key, value);
    });
  }

  /**
   * 检查变量是否存在
   */
  hasVariable(key: string): boolean {
    return this.variables.has(key);
  }

  /**
   * 检查开关是否存在
   */
  hasSwitch(key: string): boolean {
    return this.switches.has(key);
  }

  /**
   * 删除变量
   */
  deleteVariable(key: string): boolean {
    const existed = this.variables.has(key);
    if (existed) {
      const oldValue = this.variables.get(key);
      this.variables.delete(key);
      
      this.eventManager.emit('variable_deleted', {
        key,
        oldValue
      });
    }
    return existed;
  }

  /**
   * 删除开关
   */
  deleteSwitch(key: string): boolean {
    const existed = this.switches.has(key);
    if (existed) {
      const oldValue = this.switches.get(key);
      this.switches.delete(key);
      
      this.eventManager.emit('switch_deleted', {
        key,
        oldValue
      });
    }
    return existed;
  }

  /**
   * 获取状态统计信息
   */
  getStats(): {
    variableCount: number;
    switchCount: number;
    memoryUsage: number;
  } {
    return {
      variableCount: this.variables.size,
      switchCount: this.switches.size,
      memoryUsage: this.calculateMemoryUsage()
    };
  }

  /**
   * 计算内存使用量（估算）
   */
  private calculateMemoryUsage(): number {
    let size = 0;
    
    // 估算变量占用的内存
    this.variables.forEach((value, key) => {
      size += key.length * 2; // 字符串按2字节计算
      size += this.estimateValueSize(value);
    });
    
    // 估算开关占用的内存
    this.switches.forEach((value, key) => {
      size += key.length * 2;
      size += 1; // boolean占用1字节
    });
    
    return size;
  }

  /**
   * 估算值的大小
   */
  private estimateValueSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2;
    } else if (typeof value === 'number') {
      return 8;
    } else if (typeof value === 'boolean') {
      return 1;
    } else if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.estimateValueSize(item), 0);
    } else if (typeof value === 'object' && value !== null) {
      return Object.entries(value).reduce((sum, [key, val]) => {
        return sum + key.length * 2 + this.estimateValueSize(val);
      }, 0);
    }
    return 0;
  }

  // ===== Event instance APIs (preferred) =====
  getCurrentInstanceId(): number | null {
    if (this.currentInstanceOverride != null) return this.currentInstanceOverride;
    return this.instanceStack.length ? this.instanceStack[this.instanceStack.length - 1] : null;
  }
  newEventInstanceId(): number { return this.nextInstanceId++; }
  setCurrentInstance(id: number | null): void {
    if (id == null) { this.currentInstanceOverride = null; return; }
    this.currentInstanceOverride = id;
    if (!this.tempVarsByInstance.has(id)) this.tempVarsByInstance.set(id, new Map());
    if (!this.tempSwitchesByInstance.has(id)) this.tempSwitchesByInstance.set(id, new Map());
  }
  beginEventInstance(instanceId?: number): number {
    const id = (typeof instanceId === 'number' && instanceId >= 0) ? instanceId : this.nextInstanceId++;
    if (!this.tempVarsByInstance.has(id)) this.tempVarsByInstance.set(id, new Map());
    if (!this.tempSwitchesByInstance.has(id)) this.tempSwitchesByInstance.set(id, new Map());
    this.instanceStack.push(id);
    return id;
  }
  endEventInstance(id: number): void {
    const cur = this.getCurrentInstanceId();
    if (cur === id) { this.instanceStack.pop(); }
    // 清理实例存储，避免泄漏
    this.tempVarsByInstance.delete(id);
    this.tempSwitchesByInstance.delete(id);
  }
  // Backwards-compat scope APIs map to instance APIs
  hasActiveTempScope(): boolean { return this.getCurrentInstanceId() != null; }
  beginTempScope(): void { this.beginEventInstance(); }
  endTempScope(): void { const cur = this.getCurrentInstanceId(); if (cur != null) this.endEventInstance(cur); }
  setTempVariable(key: string, value: any): void {
    const cur = this.getCurrentInstanceId();
    if (cur == null) return; // no active instance; skip
    if (!this.tempVarsByInstance.has(cur)) this.tempVarsByInstance.set(cur, new Map());
    const m = this.tempVarsByInstance.get(cur)!;
    const oldValue = m.get(key);
    m.set(key, value);
    this.eventManager.emit('variable_changed', { key, oldValue, newValue: value, temporary: true });
  }
  setTempSwitch(key: string, value: boolean): void {
    const cur = this.getCurrentInstanceId();
    if (cur == null) return; // no active instance; skip
    if (!this.tempSwitchesByInstance.has(cur)) this.tempSwitchesByInstance.set(cur, new Map());
    const m = this.tempSwitchesByInstance.get(cur)!;
    const oldValue = m.get(key);
    m.set(key, !!value);
    this.eventManager.emit('switch_changed', { key, oldValue, newValue: !!value, temporary: true });
  }

  // Editor helpers (read-only)
  getTempValues(key: string): any[] {
    const out: any[] = [];
    // Collect current instance first (if any), then others (stable order by id desc)
    const cur = this.getCurrentInstanceId();
    if (cur != null) {
      const m = this.tempVarsByInstance.get(cur);
      if (m && m.has(key)) out.push(m.get(key));
    }
    const ids = Array.from(this.tempVarsByInstance.keys()).sort((a,b)=>b-a);
    for (const id of ids) {
      if (id === cur) continue;
      const m = this.tempVarsByInstance.get(id)!;
      if (m.has(key)) out.push(m.get(key));
    }
    return out;
  }
  hasTemp(key: string): boolean {
    if (this.getCurrentInstanceId() != null) {
      const cur = this.getCurrentInstanceId()!;
      const m = this.tempVarsByInstance.get(cur);
      if (m && m.has(key)) return true;
    }
    for (const [, m] of this.tempVarsByInstance.entries()) { if (m.has(key)) return true; }
    return false;
  }
  getTempSwitchValues(key: string): boolean[] {
    const out: boolean[] = [];
    const cur = this.getCurrentInstanceId();
    if (cur != null) {
      const m = this.tempSwitchesByInstance.get(cur);
      if (m && m.has(key)) out.push(!!m.get(key));
    }
    const ids = Array.from(this.tempSwitchesByInstance.keys()).sort((a,b)=>b-a);
    for (const id of ids) {
      if (id === cur) continue;
      const m = this.tempSwitchesByInstance.get(id)!;
      if (m.has(key)) out.push(!!m.get(key));
    }
    return out;
  }
  hasTempSwitch(key: string): boolean {
    if (this.getCurrentInstanceId() != null) {
      const cur = this.getCurrentInstanceId()!;
      const m = this.tempSwitchesByInstance.get(cur);
      if (m && m.has(key)) return true;
    }
    for (const [, m] of this.tempSwitchesByInstance.entries()) { if (m.has(key)) return true; }
    return false;
  }
}
