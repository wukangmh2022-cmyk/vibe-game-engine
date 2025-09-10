import {
  CommandExecutor,
  StateManager,
  EventManager,
  Logger,
  LogLevel,
  createDefaultHandlers
} from './src';
import { CommandType, GameCommand } from './src/types';

/**
 * 流程控制指令测试
 */
async function testFlowControl() {
  console.log('=== 流程控制指令测试开始 ===');
  
  // 创建管理器实例
  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);
  const logger = new Logger(LogLevel.INFO, 'FlowControlTest');
  
  // 创建Mock管理器
  const mockResourceManager = {
    loadResource: async () => ({}),
    getResource: () => ({}),
    preloadResources: async () => {}
  };
  
  const mockRenderManager = {
    render: async () => {},
    clear: () => {},
    inputAdapter: {
      registerClickHandler: async () => {},
      registerTextInput: async () => {}
    }
  };
  
  const mockAudioManager = {
    playSound: async () => {},
    playMusic: async () => {},
    stopAudio: () => {}
  };
  
  // 创建指令执行器
  const executor = new CommandExecutor(
    stateManager,
    eventManager,
    mockResourceManager as any,
    mockRenderManager as any,
    mockAudioManager as any,
    logger
  );
  
  // 注册所有默认指令处理器
  const handlers = createDefaultHandlers();
  handlers.forEach(handler => {
    executor.registerHandler(handler);
  });
  
  // 测试1: If条件分支
  console.log('\n--- 测试1: If条件分支 ---');
  await testIfCondition(executor, stateManager);
  
  // 测试2: For循环
  console.log('\n--- 测试2: For循环 ---');
  await testForLoop(executor, stateManager);
  
  // 测试3: While循环
  console.log('\n--- 测试3: While循环 ---');
  await testWhileLoop(executor, stateManager);
  
  // 测试4: Break和Continue
  console.log('\n--- 测试4: Break和Continue ---');
  await testBreakContinue(executor, stateManager);
  
  // 测试5: 嵌套流程控制
  console.log('\n--- 测试5: 嵌套流程控制 ---');
  await testNestedFlowControl(executor, stateManager);
  
  console.log('\n=== 流程控制指令测试完成 ===');
}

/**
 * 测试If条件分支
 */
async function testIfCondition(executor: CommandExecutor, stateManager: StateManager) {
  // 设置测试变量
  stateManager.setVariable('score', 85);
  
  const ifCommand: GameCommand = {
    id: 'test_if_1',
    type: CommandType.IF_CONDITION,
    parameters: {
      condition: {
        type: 'variable',
        key: 'score',
        operator: 'gte',
        value: 80
      },
      trueCommands: [
        {
          id: 'set_grade_a',
          type: CommandType.SET_VARIABLE,
          parameters: {
            name: 'grade',
            value: 'A'
          }
        }
      ],
      falseCommands: [
        {
          id: 'set_grade_b',
          type: CommandType.SET_VARIABLE,
          parameters: {
            name: 'grade',
            value: 'B'
          }
        }
      ]
    }
  };
  
  const result = await executor.executeCommand(ifCommand);
  console.log('If条件测试结果:', result.success ? '成功' : '失败');
  console.log('等级设置为:', stateManager.getVariable('grade'));
}

/**
 * 测试For循环
 */
async function testForLoop(executor: CommandExecutor, stateManager: StateManager) {
  stateManager.setVariable('sum', 0);
  
  const forCommand: GameCommand = {
    id: 'test_for_1',
    type: CommandType.LOOP,
    parameters: {
      loopType: 'for',
      variable: 'i',
      start: 1,
      end: 6,
      step: 1,
      commands: [
        {
          id: 'add_to_sum',
          type: CommandType.SET_VARIABLE,
          parameters: {
            name: 'sum',
            value: '${sum} + ${i}',
            expression: true
          }
        }
      ]
    }
  };
  
  const result = await executor.executeCommand(forCommand);
  console.log('For循环测试结果:', result.success ? '成功' : '失败');
  console.log('累加结果:', stateManager.getVariable('sum'));
}

/**
 * 测试While循环
 */
async function testWhileLoop(executor: CommandExecutor, stateManager: StateManager) {
  stateManager.setVariable('counter', 0);
  
  const whileCommand: GameCommand = {
    id: 'test_while_1',
    type: CommandType.LOOP,
    parameters: {
      loopType: 'while',
      condition: {
        type: 'variable',
        key: 'counter',
        operator: 'lt',
        value: 3
      },
      commands: [
        {
          id: 'increment_counter',
          type: CommandType.SET_VARIABLE,
          parameters: {
            name: 'counter',
            value: '${counter} + 1',
            expression: true
          }
        }
      ]
    }
  };
  
  const result = await executor.executeCommand(whileCommand);
  console.log('While循环测试结果:', result.success ? '成功' : '失败');
  console.log('计数器值:', stateManager.getVariable('counter'));
}

/**
 * 测试Break和Continue
 */
async function testBreakContinue(executor: CommandExecutor, stateManager: StateManager) {
  stateManager.setVariable('result', '');
  
  const loopWithBreakCommand: GameCommand = {
    id: 'test_break_1',
    type: CommandType.LOOP,
    parameters: {
      loopType: 'for',
      variable: 'i',
      start: 1,
      end: 10,
      step: 1,
      commands: [
        {
          id: 'check_break',
          type: CommandType.BREAK,
          parameters: {
            condition: {
              type: 'variable',
              key: 'i',
              operator: 'eq',
              value: 5
            }
          }
        },
        {
          id: 'append_result',
          type: CommandType.SET_VARIABLE,
          parameters: {
            name: 'result',
            value: '${result}${i}',
            expression: true
          }
        }
      ]
    }
  };
  
  const result = await executor.executeCommand(loopWithBreakCommand);
  console.log('Break测试结果:', result.success ? '成功' : '失败');
  console.log('循环结果:', stateManager.getVariable('result'));
}

/**
 * 测试嵌套流程控制
 */
async function testNestedFlowControl(executor: CommandExecutor, stateManager: StateManager) {
  stateManager.setVariable('matrix', '');
  
  const nestedCommand: GameCommand = {
    id: 'test_nested_1',
    type: CommandType.LOOP,
    parameters: {
      loopType: 'for',
      variable: 'row',
      start: 1,
      end: 4,
      step: 1,
      commands: [
        {
          id: 'inner_loop',
          type: CommandType.LOOP,
          parameters: {
            loopType: 'for',
            variable: 'col',
            start: 1,
            end: 4,
            step: 1,
            commands: [
              {
                id: 'check_diagonal',
                type: CommandType.IF_CONDITION,
                parameters: {
                  condition: {
                    type: 'expression',
                    expression: '${row} === ${col}'
                  },
                  trueCommands: [
                    {
                      id: 'add_star',
                      type: CommandType.SET_VARIABLE,
                      parameters: {
                        name: 'matrix',
                        value: '${matrix}*',
                        expression: true
                      }
                    }
                  ],
                  falseCommands: [
                    {
                      id: 'add_dash',
                      type: CommandType.SET_VARIABLE,
                      parameters: {
                        name: 'matrix',
                        value: '${matrix}-',
                        expression: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          id: 'add_newline',
          type: CommandType.SET_VARIABLE,
          parameters: {
            name: 'matrix',
            value: '${matrix}\n',
            expression: true
          }
        }
      ]
    }
  };
  
  const result = await executor.executeCommand(nestedCommand);
  console.log('嵌套流程控制测试结果:', result.success ? '成功' : '失败');
  console.log('矩阵结果:\n', stateManager.getVariable('matrix'));
}

// 运行测试
testFlowControl().catch(console.error);