import {
  StateManager,
  EventManager,
  CommandExecutor,
  createDefaultHandlers,
  CommandType
} from '../src';
import { Logger, LogLevel } from '../src/utils/Logger';

/**
 * 调试指令处理器注册情况
 */
async function debugHandlers() {
  console.log('=== 调试指令处理器注册情况 ===\n');

  // 创建管理器实例
  const logger = new Logger(LogLevel.DEBUG, '[DebugHandlers]');
  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);

  // 创建指令执行器
  const executor = new CommandExecutor(
    stateManager,
    eventManager,
    null as any, // resourceManager
    null as any, // renderManager
    null as any, // audioManager
    logger
  );

  // 获取默认处理器
  const handlers = createDefaultHandlers();
  console.log('📋 创建的处理器数量:', handlers.length);
  
  // 注册处理器并显示详情
  console.log('\n🔧 注册处理器:');
  handlers.forEach((handler, index) => {
    console.log(`${index + 1}. ${handler.constructor.name} -> type: "${handler.type}"`);
    executor.registerHandler(handler);
  });

  // 检查特定类型
  console.log('\n🔍 检查特定指令类型:');
  const testTypes = [
    'SHOW_CHOICES',
    CommandType.SHOW_CHOICES,
    'show_choices',
    'SHOW_TEXT',
    CommandType.SHOW_TEXT,
    'show_text'
  ];

  testTypes.forEach(type => {
    const hasHandler = (executor as any).handlers.has(type);
    console.log(`  "${type}" (${typeof type}): ${hasHandler ? '✅ 已注册' : '❌ 未找到'}`);
  });

  // 显示所有已注册的处理器键
  console.log('\n📊 所有已注册的处理器键:');
  const handlerKeys = Array.from((executor as any).handlers.keys());
  handlerKeys.forEach((key, index) => {
    console.log(`  ${index + 1}. "${key}" (${typeof key})`);
  });

  console.log('\n=== 调试完成 ===');
}

// 运行调试
debugHandlers().catch(console.error);