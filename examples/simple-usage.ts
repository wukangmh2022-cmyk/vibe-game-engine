/**
 * 游戏运行时引擎简单使用示例
 */

import {
  StateManager,
  EventManager,
  CommandExecutor,
  createDefaultHandlers,
  CommandType,
  GameCommand
} from '../src';
import { Logger, LogLevel } from '../src/utils/Logger';

// 简单示例：展示核心组件的基本用法
async function simpleExample() {
  console.log('=== 游戏运行时引擎核心组件示例 ===');

  // 1. 创建状态管理器
  console.log('\n1. 创建状态管理器...');
  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);

  // 设置初始状态
  stateManager.setVariable('playerName', '玩家');
  stateManager.setVariable('score', 0);
  stateManager.setSwitch('gameStarted', false);

  console.log('初始状态:', {
    variables: stateManager.getAllVariables(),
    switches: stateManager.getAllSwitches()
  });

  // 2. 创建指令执行器
  console.log('\n2. 创建指令执行器...');
  const logger = new Logger(LogLevel.INFO, '[SimpleExample]');
  const commandExecutor = new CommandExecutor(
    stateManager,
    eventManager,
    null as any, // resourceManager
    null as any, // renderManager
    null as any, // audioManager
    logger
  );

  // 注册默认指令处理器
  const handlers = createDefaultHandlers();
  handlers.forEach(handler => {
    commandExecutor.registerHandler(handler);
  });

  console.log('已注册的指令处理器:', commandExecutor.getRegisteredHandlers());

  // 3. 执行指令
  console.log('\n3. 执行指令...');

  // 设置变量指令
  const setVariableCommand: GameCommand = {
    id: 'set-name',
    type: CommandType.SET_VARIABLE,
    parameters: {
      key: 'playerName',
      value: '小明'
    },
    metadata: {
      description: '设置玩家姓名'
    }
  };

  const context = {
    stateManager,
    eventManager,
    resourceManager: null as any,
    renderManager: null as any,
    audioManager: null as any,
    techStackAdapter: null as any,
    logger: null as any
  };

  const result1 = await commandExecutor.executeCommand(setVariableCommand);
  console.log('设置变量结果:', result1);
  console.log('更新后的变量:', stateManager.getVariable('playerName'));

  // 设置开关指令
  const setSwitchCommand: GameCommand = {
    id: 'start-game',
    type: CommandType.SET_SWITCH,
    parameters: {
      key: 'gameStarted',
      value: true
    },
    metadata: {
      description: '开始游戏'
    }
  };

  const result2 = await commandExecutor.executeCommand(setSwitchCommand);
  console.log('设置开关结果:', result2);
  console.log('更新后的开关:', stateManager.getSwitch('gameStarted'));

  // 4. 事件系统示例
  console.log('\n4. 事件系统示例...');

  // 监听状态变化事件
  eventManager.on('variable_changed', (data) => {
    console.log('变量变化事件:', data);
  });

  eventManager.on('switch_changed', (data) => {
    console.log('开关变化事件:', data);
  });

  // 触发状态变化
  stateManager.setVariable('score', 100);
  stateManager.setSwitch('levelComplete', true);

  // 5. 批量操作示例
  console.log('\n5. 批量操作示例...');

  stateManager.setVariables({
    level: 1,
    health: 100,
    mana: 50
  });

  stateManager.setSwitches({
    hasKey: true,
    doorOpen: false,
    questComplete: false
  });

  console.log('最终状态:', {
    variables: stateManager.getAllVariables(),
    switches: stateManager.getAllSwitches(),
    stats: stateManager.getStats()
  });

  console.log('\n=== 示例完成 ===');
}

// 运行示例
if (require.main === module) {
  simpleExample().catch(console.error);
}

export { simpleExample };