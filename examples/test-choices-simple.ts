2025-09-03T03:40:26.446Z [BasicGameTest] [ERROR] Command validation failed: Missing required parameter: points {
  command: {
    id: 'cmd6',
    type: 'add_score',
    parameters: { amount: 100 },
    metadata: { description: '增加100分' }
  },
  validation: { valid: false, errors: [ [Object] ] }
}
❌ 指令执行失败: Command validation failed: Missing required parameter: pointsimport {
  StateManager,
  EventManager,
  CommandExecutor,
  createDefaultHandlers,
  CommandType,
  GameCommand
} from '../src';
import { Logger, LogLevel } from '../src/utils/Logger';

/**
 * 简单测试SHOW_CHOICES指令功能
 */
async function testShowChoices() {
  console.log('=== 测试SHOW_CHOICES指令功能 ===\n');

  // 创建管理器实例
  const logger = new Logger(LogLevel.INFO, '[TestChoices]');
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

  // 注册默认指令处理器
  const handlers = createDefaultHandlers();
  handlers.forEach(handler => {
    executor.registerHandler(handler);
  });

  // 监听选择显示事件
  eventManager.on('choices_displayed', (data) => {
    console.log('\n🎯 选择事件触发:', {
      commandId: data.commandId,
      title: data.title,
      choiceCount: data.choices.length,
      timeout: data.timeout
    });
  });

  // 创建SHOW_CHOICES指令
  const showChoicesCommand: GameCommand = {
    id: 'test_choices',
    type: CommandType.SHOW_CHOICES,
    parameters: {
      title: '请选择你的下一步行动：',
      choices: [
        {
          text: '继续探索',
          description: '继续在游戏世界中探索',
          value: 'explore'
        },
        {
          text: '查看背包',
          description: '检查你的物品和装备',
          value: 'inventory'
        },
        {
          text: '休息一下',
          description: '恢复体力和精神',
          value: 'rest'
        }
      ],
      timeout: 30000
    },
    metadata: {
      description: '显示玩家选择选项'
    }
  };

  try {
    console.log('📋 执行SHOW_CHOICES指令...');
    const result = await executor.executeCommand(showChoicesCommand);
    
    console.log('\n✅ 指令执行结果:', result);
    
    if (result.success) {
      console.log('\n🎉 SHOW_CHOICES功能测试成功！');
      console.log('📊 返回数据:', result.data);
    } else {
      console.log('\n❌ SHOW_CHOICES功能测试失败:', result.error);
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 运行测试
testShowChoices().catch(console.error);