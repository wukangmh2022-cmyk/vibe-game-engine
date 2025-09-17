/**
 * 游戏运行时引擎主入口
 */

// 导出核心类型
export * from './types';

// 导出核心类
import { GameRuntime } from './core/GameRuntime';
import { StateManager } from './core/StateManager';
import { EventManager } from './core/EventManager';
import { CommandExecutor, BaseCommandHandler } from './core/CommandExecutor';
import { Logger, LogLevel } from './utils/Logger';

export { GameRuntime, StateManager, EventManager, CommandExecutor, BaseCommandHandler };

// 导出指令处理器
export * from './commands';

// 导出拖拽处理器
export * from './handlers';

// 导出工具类
export { Logger, LogLevel };

// Library-style browser bootstrap API (mount the runtime into a container)
export * from './browser/bootstrap';

// 导出版本信息
export const VERSION = '1.0.0';

/**
 * 创建游戏运行时实例的便捷函数
 */
export function createGameRuntime(
  resourceManager: any,
  renderManager: any,
  audioManager: any,
  techStackAdapter: any,
  logger?: any
) {
  return new GameRuntime(
    resourceManager,
    renderManager,
    audioManager,
    techStackAdapter,
    logger
  );
}

/**
 * 默认导出
 */
export default {
  GameRuntime,
  StateManager,
  EventManager,
  CommandExecutor,
  Logger,
  VERSION,
  createGameRuntime
};
