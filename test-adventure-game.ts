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
const globalButtons = new Map<string, MockElement>(); // 保留但不再用于触发

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

// 删除 MockShowButtonHandler，使用真实运行时的 ShowButtonHandler

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
  const gameConfigPath = path.join(__dirname, 'adventure-choice-game-v2.json');
  const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, 'utf8'));
  
  // 创建管理器
  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);
  
  // 创建模拟的其他管理器
  const resourceMap: Record<string, any> = {
    'forest-bg': { url: 'images/forest-background.svg', type: 'image' },
    'treasure-room': { url: 'images/treasure-room.svg', type: 'image' },
    'game-over-screen': { url: 'images/game-over.svg', type: 'image' },
    'backpack': { url: 'images/backpack.svg', type: 'image' },
    'legendary-sword': { url: 'images/sword.svg', type: 'image' },
  };
  const mockResourceManager = {
    loadResource: async () => ({}),
    preloadResources: async () => {},
    getResource: (id: string) => resourceMap[id],
    unloadResource: (_id: string) => {}
  };
  const mockRenderManager = {
    createElement: (cfg: any) => {
      let el = mockDocument.getElementById(cfg.id);
      if (!el) el = mockDocument.createMockElement(cfg.id);
      el.style = el.style || {};
      if (cfg.position) {
        el.style.left = `${cfg.position.x || 0}px`;
        el.style.top = `${cfg.position.y || 0}px`;
      }
      if (cfg.size) {
        el.style.width = `${cfg.size.width || 0}px`;
        el.style.height = `${cfg.size.height || 0}px`;
      }
      (el as any).src = cfg.src || null;
      return el;
    },
    updateElement: (_id: string, _updates: any) => {},
    removeElement: (_id: string) => {},
    render: () => {}
  };
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
  
  // 不注册 Mock SHOW_BUTTON，改用真实的 ShowButtonHandler（已在 factory 中注册）
  
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
      if (!trigger) continue;
      // 直接挂载自定义目标信号
      if (trigger.type === 'custom' && (trigger as any).target) {
        const target = (trigger as any).target;
        console.log(`📝 监听信号: ${target} -> 触发事件: ${event.name}`);
        eventManager.on(target, async () => {
          console.log(`\n🎯 触发事件: ${event.name}`);
          for (const command of event.commands) {
            await executor.executeCommand(command);
          }
        });
      }
      // 兼容：表达式型自定义触发（解析 event.type === 'xxx'）
      if (trigger && trigger.type === 'custom' && trigger.condition && trigger.condition.type === 'expression') {
        console.log(`📝 注册事件: ${event.name} - ${trigger.condition.expression}`);
        const match = /event\.type\s*===\s*'([^']+)'/.exec(trigger.condition.expression);
        if (match) {
          const eventName = match[1];
          console.log(`🔗 解析表达式监听事件: ${eventName}`);
          eventManager.on(eventName, async (eventData: any) => {
            console.log(`🎯 检查事件匹配: ${trigger.condition.expression}`);
            console.log(`📥 收到事件(${eventName}):`, eventData);
            try {
              const eventVar = { type: eventName, ...(eventData || {}) };
              const result = eval(trigger.condition.expression.replace(/\bevent\b/g, 'eventVar'));
              console.log(`🔍 表达式结果: ${result}`);
              if (result) {
                console.log(`\n🎯 触发事件: ${event.name}`);
                (global as any).event = eventVar;
                try {
                  for (const command of event.commands) {
                    await executor.executeCommand(command);
                  }
                } finally {
                  delete (global as any).event;
                }
              }
            } catch (error) {
              console.log(`❌ 表达式执行错误:`, error);
            }
          });
        }
      }
    }
  }
  
  // 预先挂载交互回调（基于运行时事件契约）
  // 1) 是/否按钮：监听展示后，自动选择“是”分支
  eventManager.on('button_displayed', (payload: any) => {
    console.log('🪄 自动选择按钮分支: yes', payload);
    eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'yes' });
  });
  // 2) 多路选择：先帮助小鹿获得钥匙，再选左边小径
  eventManager.on('choices_displayed', async (payload: any) => {
    console.log('🪄 自动选择选项: help-deer 获取钥匙', payload);
    eventManager.emit('choice_selected', { commandId: payload.commandId, elementId: payload.elementId, optionId: 'help-deer' });
    // 等待指令链执行完毕（扣金币/给钥匙/更新文本）
    await new Promise(r => setTimeout(r, 50));
    console.log('🪄 再次选择选项: left-path 进入洞穴');
    eventManager.emit('choice_selected', { commandId: payload.commandId, elementId: payload.elementId, optionId: 'left-path' });
    // 再等待子指令（创建投放区/显示宝剑/设置可拖拽）
    await new Promise(r => setTimeout(r, 50));
    // 模拟拖拽成功（将宝剑丢到背包）
    console.log('🪄 模拟投放事件: drop:success (sword -> bag-drop-zone)');
    eventManager.emit('drop:success', { dropZoneId: 'bag-drop-zone', draggedElementId: 'sword' });
  });

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

  // 使用运行时事件契约驱动交互：
  // 1) 是/否按钮：监听展示后，自动选择“是”分支
  eventManager.on('button_displayed', (payload: any) => {
    console.log('🪄 自动选择按钮分支: yes', payload);
    eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'yes' });
  });
  // 2) 多路选择：监听展示后，自动选择 id 为 'left-path' 的选项
  eventManager.on('choices_displayed', (payload: any) => {
    console.log('🪄 自动选择选项: left-path', payload);
    eventManager.emit('choice_selected', { commandId: payload.commandId, elementId: payload.elementId, optionId: 'left-path' });
  });

  // 额外验证：直接执行 JSON 中的 EMIT_SIGNAL 指令并检查事件是否被正确触发
  console.log('\n🧪 验证 EMIT_SIGNAL 事件触发（基于 JSON 配置）');
  let enteredForestSignals = 0;
  let treasureCollectedSignals = 0;
  eventManager.on('entered-forest', () => {
    enteredForestSignals += 1;
    console.log('✅ 捕获到信号: entered-forest');
  });
  eventManager.on('treasure_collected', () => {
    treasureCollectedSignals += 1;
    console.log('✅ 捕获到信号: treasure_collected');
  });

  // 在 JSON 中查找并执行 EMIT_SIGNAL 指令
  const collectCommands = (obj: any, acc: any[] = []): any[] => {
    if (!obj || typeof obj !== 'object') return acc;
    if (Array.isArray(obj)) {
      for (const item of obj) collectCommands(item, acc);
      return acc;
    }
    if (obj.events && Array.isArray(obj.events)) collectCommands(obj.events, acc);
    if (obj.parameters && typeof obj.parameters === 'object') collectCommands(obj.parameters, acc);
    if (obj.commands && Array.isArray(obj.commands)) collectCommands(obj.commands, acc);
    if (obj.trueCommands && Array.isArray(obj.trueCommands)) collectCommands(obj.trueCommands, acc);
    if (obj.falseCommands && Array.isArray(obj.falseCommands)) collectCommands(obj.falseCommands, acc);
    if (obj.options && Array.isArray(obj.options)) collectCommands(obj.options, acc);
    if (obj.branches && typeof obj.branches === 'object') {
      const b = obj.branches as any;
      if (b.yes && Array.isArray(b.yes.commands)) collectCommands(b.yes.commands, acc);
      if (b.no && Array.isArray(b.no.commands)) collectCommands(b.no.commands, acc);
    }
    if (obj && obj.type && typeof obj.type === 'string') acc.push(obj);
    return acc;
  };

  const allNested = collectCommands(level);
  const signalCommands = allNested.filter(c => String(c.type).toLowerCase() === 'emit_signal' || String(c.type).toLowerCase() === 'emit signal' || String(c.type).toLowerCase() === 'emitsignal');
  console.log(`🔎 在 JSON 中找到 ${signalCommands.length} 条 EMIT_SIGNAL 指令`);
  for (const sigCmd of signalCommands) {
    await executor.executeCommand(sigCmd);
  }
  // 等待事件派发微任务完成
  await new Promise(r => setTimeout(r, 10));
  console.log(`📈 entered-forest 捕获次数: ${enteredForestSignals}`);
  console.log(`📈 treasure_collected 捕获次数: ${treasureCollectedSignals}`);
  
  // 给事件流一些时间执行
  await new Promise(resolve => setTimeout(resolve, 200));
  
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