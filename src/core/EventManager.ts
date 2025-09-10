import { IEventManager, EventListener } from '../types';

/**
 * 事件管理器
 * 负责事件的注册、触发和管理
 */
export class EventManager implements IEventManager {
  private listeners: Map<string, Set<EventListener>> = new Map();
  private onceListeners: Map<string, Set<EventListener>> = new Map();
  private maxListeners: number = 100;
  private eventHistory: Array<{ event: string; data: any; timestamp: number }> = [];
  private maxHistorySize: number = 1000;

  /**
   * 注册事件监听器
   */
  on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const eventListeners = this.listeners.get(event)!;
    
    // 检查监听器数量限制
    if (eventListeners.size >= this.maxListeners) {
      console.warn(`Event '${event}' has reached maximum listeners limit (${this.maxListeners})`);
      return;
    }
    
    eventListeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(event: string, listener: EventListener): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      
      // 如果没有监听器了，删除事件
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
    
    // 同时从一次性监听器中移除
    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      onceListeners.delete(listener);
      
      if (onceListeners.size === 0) {
        this.onceListeners.delete(event);
      }
    }
  }

  /**
   * 触发事件
   */
  async emit(event: string, data?: any): Promise<void> {
    // 记录事件历史
    this.addToHistory(event, data);
    
    // 触发普通监听器
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const promises: Promise<void>[] = [];
      
      for (const listener of eventListeners) {
        try {
          const result = listener(data);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`Error in event listener for '${event}':`, error);
        }
      }
      
      // 等待所有异步监听器完成
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }
    
    // 触发一次性监听器
    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      const promises: Promise<void>[] = [];
      
      for (const listener of onceListeners) {
        try {
          const result = listener(data);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`Error in once event listener for '${event}':`, error);
        }
      }
      
      // 清除一次性监听器
      this.onceListeners.delete(event);
      
      // 等待所有异步监听器完成
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }
  }

  /**
   * 注册一次性事件监听器
   */
  once(event: string, listener: EventListener): void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    
    const onceListeners = this.onceListeners.get(event)!;
    
    // 检查监听器数量限制
    if (onceListeners.size >= this.maxListeners) {
      console.warn(`Event '${event}' has reached maximum once listeners limit (${this.maxListeners})`);
      return;
    }
    
    onceListeners.add(listener);
  }

  /**
   * 移除所有事件监听器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * 获取事件的监听器数量
   */
  listenerCount(event: string): number {
    const regularCount = this.listeners.get(event)?.size || 0;
    const onceCount = this.onceListeners.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * 获取所有事件名称
   */
  eventNames(): string[] {
    const events = new Set<string>();
    
    this.listeners.forEach((_, event) => events.add(event));
    this.onceListeners.forEach((_, event) => events.add(event));
    
    return Array.from(events);
  }

  /**
   * 设置最大监听器数量
   */
  setMaxListeners(max: number): void {
    this.maxListeners = Math.max(1, max);
  }

  /**
   * 获取最大监听器数量
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }

  /**
   * 添加事件到历史记录
   */
  private addToHistory(event: string, data: any): void {
    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now()
    });
    
    // 限制历史记录大小
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * 获取事件历史记录
   */
  getEventHistory(event?: string, limit?: number): Array<{ event: string; data: any; timestamp: number }> {
    let history = this.eventHistory;
    
    if (event) {
      history = history.filter(item => item.event === event);
    }
    
    if (limit && limit > 0) {
      history = history.slice(-limit);
    }
    
    return [...history];
  }

  /**
   * 清除事件历史记录
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 设置事件历史记录最大大小
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(0, size);
    
    // 如果当前历史记录超过新的限制，截断它
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEvents: number;
    totalListeners: number;
    totalOnceListeners: number;
    historySize: number;
    eventBreakdown: Record<string, { listeners: number; onceListeners: number }>;
  } {
    const eventBreakdown: Record<string, { listeners: number; onceListeners: number }> = {};
    let totalListeners = 0;
    let totalOnceListeners = 0;
    
    // 统计普通监听器
    this.listeners.forEach((listeners, event) => {
      if (!eventBreakdown[event]) {
        eventBreakdown[event] = { listeners: 0, onceListeners: 0 };
      }
      eventBreakdown[event].listeners = listeners.size;
      totalListeners += listeners.size;
    });
    
    // 统计一次性监听器
    this.onceListeners.forEach((listeners, event) => {
      if (!eventBreakdown[event]) {
        eventBreakdown[event] = { listeners: 0, onceListeners: 0 };
      }
      eventBreakdown[event].onceListeners = listeners.size;
      totalOnceListeners += listeners.size;
    });
    
    return {
      totalEvents: this.eventNames().length,
      totalListeners,
      totalOnceListeners,
      historySize: this.eventHistory.length,
      eventBreakdown
    };
  }

  /**
   * 等待特定事件触发
   */
  waitFor(event: string, timeout?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      
      const listener = (data: any) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(data);
      };
      
      this.once(event, listener);
      
      if (timeout && timeout > 0) {
        timeoutId = setTimeout(() => {
          this.off(event, listener);
          reject(new Error(`Timeout waiting for event '${event}' after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  /**
   * 创建事件命名空间
   */
  namespace(prefix: string): EventNamespace {
    return new EventNamespace(this, prefix);
  }
}

/**
 * 事件命名空间
 * 提供带前缀的事件管理
 */
export class EventNamespace {
  constructor(
    private eventManager: IEventManager,
    private prefix: string
  ) {}

  private getFullEventName(event: string): string {
    return `${this.prefix}:${event}`;
  }

  on(event: string, listener: EventListener): void {
    this.eventManager.on(this.getFullEventName(event), listener);
  }

  off(event: string, listener: EventListener): void {
    this.eventManager.off(this.getFullEventName(event), listener);
  }

  emit(event: string, data?: any): void {
    this.eventManager.emit(this.getFullEventName(event), data);
  }

  once(event: string, listener: EventListener): void {
    this.eventManager.once(this.getFullEventName(event), listener);
  }
}