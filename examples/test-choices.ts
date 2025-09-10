import { GameEngine } from '../src/core/GameEngine';
import { createDefaultHandlers } from '../src/commands/factory';
import { ConsoleLogger } from '../src/utils/Logger';
import { EventManager } from '../src/core/EventManager';
import { StateManager } from '../src/core/StateManager';
import { ResourceManager } from '../src/core/ResourceManager';
import { RenderManager } from '../src/core/RenderManager';
import { AudioManager } from '../src/core/AudioManager';

/**
 * 测试SHOW_CHOICES指令功能
 */
async function testChoicesFeature() {
  console.log('=== 测试SHOW_CHOICES指令功能 ===\n');

  // 创建管理器实例
  const logger = new ConsoleLogger();
  const eventManager = new EventManager();
  const stateManager = new StateManager();
  const resourceManager = new ResourceManager();
  const renderManager = new RenderManager();
  const audioManager = new AudioManager();

  // 创建游戏引擎
  const gameEngine = new GameEngine({
    logger,
    eventManager,
    stateManager,
    resourceManager,
    renderManager,
    audioManager,
    handlers: createDefaultHandlers()
  });

  // 监听选择显示事件
  eventManager.on('choices_displayed', (data) => {
    console.log('\n🎯 选择事件触发:', {
      commandId: data.commandId,
      title: data.title,
      choiceCount: data.choices.length
    });
  });

  try {
    // 加载包含选择功能的游戏配置
    await gameEngine.loadGame('./examples/basic-game.json');
    
    console.log('✅ 游戏配置加载成功');
    console.log('📊 当前游戏状态:', gameEngine.getCurrentState());
    
    // 开始游戏
    await gameEngine.startGame();
    
    console.log('\n🎮 游戏开始执行...');
    console.log('📊 最终游戏状态:', gameEngine.getCurrentState());
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testChoicesFeature().catch(console.error);