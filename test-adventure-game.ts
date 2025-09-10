import { CommandExecutor } from './src/core/CommandExecutor';
import { StateManager } from './src/core/StateManager';
import { EventManager } from './src/core/EventManager';
import { IfConditionHandler } from './src/commands/IfConditionHandler';
import { SetVariableHandler } from './src/commands/SetVariableHandler';
import { createDefaultHandlers } from './src/commands/factory';
import { ExpressionParser } from './src/utils/ExpressionParser';
import { CommandResult, CommandContext, GameCommand } from './src/types';
import * as fs from 'fs';
import * as path from 'path';

// 模拟DOM环境
class MockElement {
  id: string;
  textContent: string = '';
  style: any = {};
  onclick: (() => void) | null = null;
  
  constructor(id: string) {
    this.id = id;
  }
  
  addEventListener(event: string, handler: () => void) {
    if (event === 'click') {
      this.onclick = handler;
    }
  }
  
  click() {
    if (this.onclick) {
      this.onclick();
    }
  }
}

class MockDocument {
  private elements: Map<string, MockElement> = new Map();
  
  getElementById(id: string): MockElement | null {
    return this.elements.get(id) || null;
  }
  
  createElement(tagName: string): MockElement {
    const element = new MockElement(`${tagName}-${Date.now()}`);
    return element;
  }
  
  createTextNode(text: string): any {
    return { textContent: text };
  }
  
  // 模拟创建元素
  createMockElement(id: string): MockElement {
    const element = new MockElement(id);
    this.elements.set(id, element);
    return element;
  }
  
  // 获取所有元素用于调试
  getAllElements(): Map<string, MockElement> {
    return this.elements;
  }
}

// 设置全局mock
const mockDocument = new MockDocument();
(global as any).document = mockDocument;

// 全局存储UI元素
const uiElements = new Map<string, string>();
const globalButtons = new Map<string, MockElement>();

// 自定义处理器来模拟UI操作
class MockShowTextHandler {
  validate(command: GameCommand) {
    return { valid: true, errors: [] };
  }
  
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, text, position, style } = command.parameters;
    
    // 创建或获取元素
    let element = mockDocument.getElementById(elementId);
    if (!element) {
      element = mockDocument.createMockElement(elementId);
    }
    
    element.textContent = this.interpolateVariables(text, context.stateManager);
    
    console.log(`📝 [${elementId}] ${element.textContent}`);
    if (position) {
      console.log(`   位置: (${position.x}, ${position.y})`);
    }
    
    return { success: true };
  }
  
  private interpolateVariables(text: string, stateManager: any): string {
    return text.replace(/\$\{([^}]+)\}/g, (match, varPath) => {
      const keys = varPath.split('.');
      let value = stateManager.getVariable(keys[0]);
      for (let i = 1; i < keys.length; i++) {
        value = value?.[keys[i]];
      }
      return value !== undefined ? String(value) : match;
    });
  }
}

class MockShowButtonHandler {
  validate(command: GameCommand) {
    return { valid: true, errors: [] };
  }
  
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, text, onClick, position, style } = command.parameters;
    
    // 创建或获取按钮元素
    let button = mockDocument.getElementById(elementId);
    if (!button) {
      button = mockDocument.createMockElement(elementId);
    }
    
    button.textContent = text;
    
    // 设置点击事件
    button.addEventListener('click', () => {
      console.log(`🖱️  点击按钮: ${text}`);
      // 触发自定义事件
      const eventData = {
        type: 'button:click',
        action: onClick,
        elementId: elementId
      };
      console.log(`📡 发射事件:`, eventData);
      context.eventManager.emit('button:click', eventData);
    });
    
    console.log(`🔘 [按钮] ${text} (点击触发: ${onClick})`);
    if (position) {
      console.log(`   位置: (${position.x}, ${position.y})`);
    }
    
    // 存储按钮引用以便后续点击
    globalButtons.set(onClick, button);
    console.log(`💾 存储按钮: ${onClick} -> ${button}`);
    console.log(`📊 当前按钮总数: ${globalButtons.size}`);
    
    return { success: true };
  }
}

class MockUpdateTextHandler {
  validate(command: GameCommand) {
    return { valid: true, errors: [] };
  }
  
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, text } = command.parameters;
    
    let element = mockDocument.getElementById(elementId);
    if (!element) {
      element = mockDocument.createMockElement(elementId);
    }
    
    element.textContent = this.interpolateVariables(text, context.stateManager);
    console.log(`🔄 [更新] ${elementId}: ${element.textContent}`);
    
    return { success: true };
  }
  
  private interpolateVariables(text: string, stateManager: any): string {
    return text.replace(/\$\{([^}]+)\}/g, (match, varPath) => {
      const keys = varPath.split('.');
      let value = stateManager.getVariable(keys[0]);
      for (let i = 1; i < keys.length; i++) {
        value = value?.[keys[i]];
      }
      return value !== undefined ? String(value) : match;
    });
  }
}

class MockHideElementsHandler {
  validate(command: GameCommand) {
    return { valid: true, errors: [] };
  }
  
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementIds } = command.parameters;
    
    for (const elementId of elementIds) {
      const element = mockDocument.getElementById(elementId);
      if (element) {
        element.style.display = 'none';
        console.log(`🙈 隐藏元素: ${elementId}`);
      }
    }
    
    return { success: true };
  }
}

// 增强的SetVariableHandler支持表达式
class EnhancedSetVariableHandler extends SetVariableHandler {
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { key, name, value, expression } = command.parameters;
    const variableKey = key || name;
    
    if (!variableKey) {
      throw new Error('SetVariable command requires either key or name parameter');
    }
    
    let finalValue = value;
    
    // 如果启用了表达式解析，使用表达式解析器
    if (expression === true && typeof value === 'string') {
      const parser = new ExpressionParser(context.stateManager);
      finalValue = parser.parse(value);
    }
    
    context.stateManager.setVariable(variableKey, finalValue);
    console.log(`📊 设置变量 ${variableKey} = ${finalValue}`);
    
    return { success: true };
  }
}

async function testAdventureGame() {
  console.log('🎮 开始冒险选择游戏测试\n');
  
  // 读取游戏配置
  const gameConfigPath = path.join(__dirname, 'adventure-choice-game.json');
  const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, 'utf8'));
  
  // 创建管理器
  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);
  
  // 创建模拟的其他管理器
  const mockResourceManager = { loadResource: async () => ({}) };
  const mockRenderManager = { render: () => {} };
  const mockAudioManager = { play: () => {} };
  const mockLogger = { 
    debug: console.log, 
    info: console.log, 
    warn: console.warn, 
    error: console.error 
  };
  
  const executor = new CommandExecutor(
    stateManager,
    eventManager,
    mockResourceManager as any,
    mockRenderManager as any,
    mockAudioManager as any,
    mockLogger as any
  );
  
  // 注册所有默认处理器
  const defaultHandlers = createDefaultHandlers();
  for (const handler of defaultHandlers) {
    executor.registerHandler(handler);
  }
  
  // 注册增强的SetVariableHandler来替换默认的
  executor.registerHandler(new EnhancedSetVariableHandler());
  
  // 为Mock处理器添加type属性
  const showTextHandler = new MockShowTextHandler();
  Object.defineProperty(showTextHandler, 'type', { value: 'SHOW_TEXT', writable: false });
  executor.registerHandler(showTextHandler as any);
  
  const showButtonHandler = new MockShowButtonHandler();
  Object.defineProperty(showButtonHandler, 'type', { value: 'SHOW_BUTTON', writable: false });
  executor.registerHandler(showButtonHandler as any);
  
  const updateTextHandler = new MockUpdateTextHandler();
  Object.defineProperty(updateTextHandler, 'type', { value: 'UPDATE_TEXT', writable: false });
  executor.registerHandler(updateTextHandler as any);
  
  const hideElementsHandler = new MockHideElementsHandler();
  Object.defineProperty(hideElementsHandler, 'type', { value: 'HIDE_ELEMENTS', writable: false });
  executor.registerHandler(hideElementsHandler as any);
  
  // 初始化游戏状态
  const level = gameConfig.levels[0];
  for (const [key, value] of Object.entries(level.initialState)) {
    stateManager.setVariable(key, value);
  }
  
  console.log('🎯 初始状态:');
  console.log(`   💰 金币: ${stateManager.getVariable('gold')}`);
  console.log(`   ❤️  生命: ${stateManager.getVariable('health')}`);
  console.log(`   ⭐ 得分: ${stateManager.getVariable('score')}`);
  console.log(`   🗝️  钥匙: ${stateManager.getVariable('hasKey')}`);
  console.log(`   ⚔️  剑: ${stateManager.getVariable('hasSword')}\n`);
  
  // 注册游戏事件
  console.log('📡 注册游戏事件...');
  console.log(`📋 开始注册事件，共 ${level.events.length} 个事件`);
  for (const event of level.events) {
    console.log(`🔍 处理事件: ${event.name}`);
    for (const trigger of event.triggers) {
      if (trigger.type === 'custom' && trigger.condition.type === 'expression') {
        console.log(`📝 注册事件: ${event.name} - ${trigger.condition.expression}`);
        
        // 注册按钮点击事件监听器
        eventManager.on('button:click', async (eventData: any) => {
          console.log(`🎯 检查事件匹配: ${trigger.condition.expression}`);
          console.log(`📥 收到事件:`, eventData);
          
          try {
             // 真正的表达式求值 - 创建一个包含event变量的作用域
             const eventVar = eventData;
             const result = eval(trigger.condition.expression.replace(/\bevent\b/g, 'eventVar'));
             console.log(`🔍 表达式结果: ${result}`);
             
             if (result) {
               console.log(`\n🎯 触发事件: ${event.name}`);
               // 执行事件命令
               for (const command of event.commands) {
                 await executor.executeCommand(command);
               }
             }
           } catch (error) {
             console.log(`❌ 表达式执行错误:`, error);
           }
        });
      }
    }
  }
  
  // 执行初始命令
  console.log('🚀 执行初始命令:\n');
  const context = {
    state: stateManager,
    eventManager: eventManager,
    executor: executor,
    buttons: new Map()
  };
  
  for (const command of level.commands) {
    await executor.executeCommand(command);
  }
  
  // 模拟用户交互
  console.log('\n🎮 开始模拟用户选择:\n');
  
  // 显示所有可用按钮
  console.log('\n🔍 可用按钮:');
  for (const [key, button] of globalButtons) {
    console.log(`   ${key}: ${button}`);
  }
  
  // 选择1: 勇敢地进入森林
  console.log('\n👤 用户选择: 勇敢地进入森林');
  const enterForestButton = globalButtons.get('enter-forest');
  console.log(`🔍 查找按钮 'enter-forest': ${enterForestButton}`);
  if (enterForestButton) {
    enterForestButton.click();
  } else {
    console.log('❌ 未找到 enter-forest 按钮');
  }
  
  // 等待一下让事件处理完成
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 选择2: 帮助小鹿 (如果有足够金币)
  if (stateManager.getVariable('gold') >= 30) {
    console.log('\n👤 用户选择: 帮助小鹿');
    const helpDeerButton = globalButtons.get('help-deer');
    console.log(`🔍 查找按钮 'help-deer': ${helpDeerButton}`);
    if (helpDeerButton) {
      helpDeerButton.click();
    } else {
      console.log('❌ 未找到 help-deer 按钮');
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 选择3: 走左边的小径
  console.log('\n👤 用户选择: 走左边的小径');
  const leftPathButton = globalButtons.get('left-path');
  console.log(`🔍 查找按钮 'left-path': ${leftPathButton}`);
  if (leftPathButton) {
    leftPathButton.click();
  } else {
    console.log('❌ 未找到 left-path 按钮');
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 选择4: 用魔法钥匙开门 (如果有钥匙)
  if (stateManager.getVariable('hasKey')) {
    console.log('\n👤 用户选择: 用魔法钥匙开门');
    const unlockDoorButton = globalButtons.get('unlock-door');
    console.log(`🔍 查找按钮 'unlock-door': ${unlockDoorButton}`);
    if (unlockDoorButton) {
      unlockDoorButton.click();
    } else {
      console.log('❌ 未找到 unlock-door 按钮');
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 显示最终状态
  console.log('\n🏆 最终游戏状态:');
  console.log(`   💰 金币: ${stateManager.getVariable('gold')}`);
  console.log(`   ❤️  生命: ${stateManager.getVariable('health')}`);
  console.log(`   ⭐ 得分: ${stateManager.getVariable('score')}`);
  console.log(`   🗝️  钥匙: ${stateManager.getVariable('hasKey')}`);
  console.log(`   ⚔️  剑: ${stateManager.getVariable('hasSword')}`);
  
  console.log('\n✅ 冒险选择游戏测试完成!');
  
  // 显示所有创建的UI元素
  console.log('\n📋 创建的UI元素:');
  const allElements = mockDocument.getAllElements();
  for (const [id, element] of allElements) {
    console.log(`   ${id}: "${element.textContent}"`);
  }
}

// 运行测试
testAdventureGame().catch(console.error);