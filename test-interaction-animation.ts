/**
 * 交互和动画指令测试
 * 简化版本，直接测试指令处理器
 */

import { EventManager } from './src/core/EventManager';
import { StateManager } from './src/core/StateManager';
import { Logger } from './src/utils/Logger';
import { ClickHandler } from './src/commands/ClickHandler';
import { InputHandler } from './src/commands/InputHandler';
import { MoveToHandler } from './src/commands/MoveToHandler';
import { ScaleToHandler } from './src/commands/ScaleToHandler';
import { RotateToHandler } from './src/commands/RotateToHandler';
import { CommandType, CommandContext } from './src/types';

/**
 * 模拟渲染管理器
 */
class MockRenderManager {
  private inputEvents: Map<string, Function[]> = new Map();
  private animationQueue: any[] = [];

  // 直接提供inputAdapter属性
  inputAdapter = {
    registerClickHandler: (elementId: string, callback: Function) => {
      console.log(`注册点击处理器: ${elementId}`);
      return Promise.resolve();
    },
    triggerClick: (elementId: string, eventData?: any) => {
      console.log(`触发点击事件: ${elementId}`);
      return Promise.resolve();
    },
    unregisterClickHandler: (elementId: string) => {
      console.log(`取消注册点击处理器: ${elementId}`);
      return Promise.resolve();
    },
    registerTextInput: (elementId: string, placeholder: string, callback: Function) => {
       console.log(`注册文本输入: ${elementId}, placeholder: ${placeholder}`);
       // 立即触发回调以模拟用户输入
       setTimeout(() => callback('测试输入'), 10);
       return Promise.resolve();
     },
    registerKeyboardInput: (callback: Function) => {
      console.log('注册键盘输入');
      return Promise.resolve();
    },
    registerNumberInput: (elementId: string, placeholder: string, callback: Function) => {
      console.log(`注册数字输入: ${elementId}, placeholder: ${placeholder}`);
      return Promise.resolve();
    }
  };

  // 直接提供animationAdapter属性
  animationAdapter = {
    moveTo: (elementId: string, x: number, y: number, duration: number, easing?: string) => {
      console.log(`移动动画: ${elementId} -> (${x}, ${y}), 时长: ${duration}ms`);
      this.animationQueue.push({ type: 'moveTo', elementId, x, y, duration, easing });
      return Promise.resolve();
    },
    scaleTo: (elementId: string, scaleX: number, scaleY: number, duration: number, easing?: string) => {
      console.log(`缩放动画: ${elementId} -> (${scaleX}, ${scaleY}), 时长: ${duration}ms`);
      this.animationQueue.push({ type: 'scaleTo', elementId, scaleX, scaleY, duration, easing });
      return Promise.resolve();
    },
    rotateTo: (elementId: string, rotation: number, duration: number, easing?: string) => {
      console.log(`旋转动画: ${elementId} -> ${rotation}度, 时长: ${duration}ms`);
      this.animationQueue.push({ type: 'rotateTo', elementId, rotation, duration, easing });
      return Promise.resolve();
    }
  };

  getInputAdapter() {
    return this.inputAdapter;
  }

  getAnimationAdapter() {
    return this.animationAdapter;
  }

  getAnimationQueue() {
    return this.animationQueue;
  }

  // 模拟获取元素
  getElement(elementId: string) {
    return {
      id: elementId,
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
  }
}

async function testInteractionAndAnimationHandlers() {
  console.log('🧪 开始测试交互和动画指令处理器...');

  try {
    // 创建模拟环境
    const eventManager = new EventManager();
    const stateManager = new StateManager(eventManager);
    const logger = new Logger();
    const mockRenderManager = new MockRenderManager();

    const context: CommandContext = {
      gameState: {
        currentLevel: '1',
        variables: stateManager.getAllVariables(),
        switches: {},
        score: 0,
        progress: 0,
        timestamp: Date.now()
      },
      stateManager,
      eventManager,
      resourceManager: {} as any,
      renderManager: mockRenderManager as any,
      audioManager: {} as any,
      logger
    }

    // 测试点击处理器
     console.log('\n📱 测试点击处理器...');
     const clickHandler = new ClickHandler();
     const clickCommand = {
       id: 'click_test',
       type: CommandType.ENABLE_CLICK,
       parameters: {
         elementId: 'button1',
         action: 'register',
         eventData: {
           nextCommands: []
         }
       }
     };
     const clickResult = await clickHandler.execute(clickCommand, context);
     console.log('✅ 点击处理器测试完成:', clickResult);

    // 测试输入处理器
     console.log('\n⌨️ 测试输入处理器...');
     const inputHandler = new InputHandler();
     const inputCommand = {
       id: 'input_test',
       type: CommandType.WAIT_FOR_INPUT,
       parameters: {
         inputType: 'text',
         elementId: 'textInput1',
         placeholder: '请输入文本',
         validation: {
           required: true,
           minLength: 2,
           maxLength: 50
         }
       }
     };
     const inputResult = await inputHandler.execute(inputCommand, context);
     console.log('✅ 输入处理器测试完成:', inputResult);

    // 测试移动动画处理器
     console.log('\n🏃 测试移动动画处理器...');
     const moveHandler = new MoveToHandler();
     const moveCommand = {
       id: 'move_test',
       type: CommandType.MOVE_TO,
       parameters: {
         elementId: 'sprite1',
         x: 300,
         y: 200,
         duration: 1000,
         easing: 'ease-in-out'
       }
     };
     const moveResult = await moveHandler.execute(moveCommand, context);
     console.log('✅ 移动动画处理器测试完成:', moveResult);

    // 测试缩放动画处理器
     console.log('\n🔍 测试缩放动画处理器...');
     const scaleHandler = new ScaleToHandler();
     const scaleCommand = {
       id: 'scale_test',
       type: CommandType.SCALE_TO,
       parameters: {
         elementId: 'sprite1',
         scale: 1.5,
         duration: 800,
         easing: 'ease-out'
       }
     };
     const scaleResult = await scaleHandler.execute(scaleCommand, context);
     console.log('✅ 缩放动画处理器测试完成:', scaleResult);

    // 测试旋转动画处理器
     console.log('\n🌀 测试旋转动画处理器...');
     const rotateHandler = new RotateToHandler();
     const rotateCommand = {
       id: 'rotate_test',
       type: CommandType.ROTATE_TO,
       parameters: {
         elementId: 'sprite1',
         rotation: 90,
         duration: 1200,
         easing: 'ease-in-out',
         direction: 'shortest'
       }
     };
     const rotateResult = await rotateHandler.execute(rotateCommand, context);
     console.log('✅ 旋转动画处理器测试完成:', rotateResult);

    // 显示动画队列
    console.log('\n📋 动画队列:');
    const animationQueue = mockRenderManager.getAnimationQueue();
    animationQueue.forEach((anim, index) => {
      console.log(`  ${index + 1}. ${anim.type}: ${anim.elementId}`);
    });

    console.log('\n🎉 所有交互和动画指令处理器测试完成！');
    console.log(`总共执行了 ${animationQueue.length} 个动画`);

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 运行测试
testInteractionAndAnimationHandlers();