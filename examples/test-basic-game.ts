import {
  StateManager,
  EventManager,
  CommandExecutor,
  createDefaultHandlers,
  GameCommand,
  CommandType
} from '../src';
import { Logger, LogLevel } from '../src/utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 测试basic-game.json中的SHOW_CHOICES功能
 */
async function testBasicGameChoices() {
  console.log('=== 测试basic-game.json中的选项功能 ===\n');

  try {
    // 读取游戏配置文件
    const gameConfigPath = path.join(__dirname, 'basic-game.json');
    const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, 'utf8'));
    
    console.log('📁 已加载游戏配置:', gameConfig.title);
    console.log('🎮 游戏版本:', gameConfig.version);
    console.log('📝 游戏描述:', gameConfig.description);

    // 创建管理器实例
    const logger = new Logger(LogLevel.INFO, '[BasicGameTest]');
    const eventManager = new EventManager();
    const stateManager = new StateManager(eventManager);

    // 设置初始状态
    const level1 = gameConfig.levels.level1;
    if (level1.initialVariables) {
      Object.entries(level1.initialVariables).forEach(([key, value]) => {
        stateManager.setVariable(key, value);
      });
    }
    if (level1.initialSwitches) {
      Object.entries(level1.initialSwitches).forEach(([key, value]) => {
        stateManager.setSwitch(key, value as boolean);
      });
    }

    console.log('\n🔧 初始状态设置完成');
    console.log('📊 变量:', stateManager.getAllVariables());
    console.log('🔀 开关:', stateManager.getAllSwitches());

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
      console.log('\n🎯 检测到选择事件:', {
        commandId: data.commandId,
        title: data.title,
        choiceCount: data.choices.length
      });
    });

    // 执行level1中的所有指令
    console.log('\n🚀 开始执行关卡指令...');
    const commands = level1.commands as GameCommand[];
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log(`\n📋 执行指令 ${i + 1}/${commands.length}: ${command.type}`);
      
      const result = await executor.executeCommand(command);
      
      if (result.success) {
        console.log('✅ 指令执行成功');
        if (command.type === CommandType.SHOW_CHOICES) {
          console.log('🎯 选择指令详情:', {
            title: result.data.title,
            choiceCount: result.data.choiceCount,
            choices: result.data.choices.map((c: any) => c.text)
          });
        }
      } else {
        console.log('❌ 指令执行失败:', result.error);
      }
    }

    console.log('\n🎉 关卡指令执行完成！');
    console.log('📊 最终状态:');
    console.log('  变量:', stateManager.getAllVariables());
    console.log('  开关:', stateManager.getAllSwitches());
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 运行测试
testBasicGameChoices().catch(console.error);