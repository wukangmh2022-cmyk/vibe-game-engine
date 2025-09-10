import { CommandType, GameCommand, CommandContext, CommandResult, Condition } from '../types';
import { BaseCommandHandler, CommandExecutor } from '../core/CommandExecutor';

/**
 * 循环指令处理器
 * 支持for循环、while循环等多种循环类型
 */
export class LoopHandler extends BaseCommandHandler {
  readonly type = CommandType.LOOP;
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { 
        loopType = 'for', 
        count = 1, 
        condition, 
        variable, 
        start = 0, 
        end = 1, 
        step = 1,
        commands = [],
        maxIterations = 1000 // 防止无限循环
      } = command.parameters;
      
      if (commands.length === 0) {
        return this.createErrorResult('No commands to execute in loop');
      }

      let executionResults: CommandResult[] = [];
      let iterations = 0;
      
      // 使用context中的executor来执行循环体，确保处理器已注册
      const executor = context.executor || new CommandExecutor(
        context.stateManager,
        context.eventManager,
        context.resourceManager,
        context.renderManager,
        context.audioManager,
        context.logger
      );
      
      switch (loopType) {
        case 'for':
          // for循环：指定次数或范围
          if (variable && typeof start === 'number' && typeof end === 'number') {
            // 带变量的for循环 (for i = start to end)
            for (let i = start; step > 0 ? i < end : i > end; i += step) {
              if (iterations >= maxIterations) {
                context.logger.warn(`Loop exceeded maximum iterations: ${maxIterations}`);
                break;
              }
              
              // 设置循环变量
              context.stateManager.setVariable(variable, i);
              
              const results = await executor.executeCommands(commands);
              executionResults.push(...results);
              
              // 检查是否有break或continue指令
              if (this.shouldBreakLoop(results)) {
                break;
              }
              if (this.shouldContinueLoop(results)) {
                 continue;
               }
              
              iterations++;
            }
          } else {
            // 简单的计数循环
            for (let i = 0; i < count; i++) {
              if (iterations >= maxIterations) {
                context.logger.warn(`Loop exceeded maximum iterations: ${maxIterations}`);
                break;
              }
              
              if (variable) {
                context.stateManager.setVariable(variable, i);
              }
              
              const results = await executor.executeCommands(commands);
              executionResults.push(...results);
              
              if (this.shouldBreakLoop(results)) {
                break;
              }
              
              iterations++;
            }
          }
          break;
          
        case 'while':
          // while循环：基于条件
          if (!condition) {
            return this.createErrorResult('While loop requires a condition');
          }
          
          while (this.evaluateCondition(condition, context)) {
            if (iterations >= maxIterations) {
              context.logger.warn(`While loop exceeded maximum iterations: ${maxIterations}`);
              break;
            }
            
            if (variable) {
              context.stateManager.setVariable(variable, iterations);
            }
            
            const results = await executor.executeCommands(commands);
            executionResults.push(...results);
            
            if (this.shouldBreakLoop(results)) {
              break;
            }
            if (this.shouldContinueLoop(results)) {
               continue;
             }
            
            iterations++;
          }
          break;
          
        case 'foreach':
          // foreach循环：遍历数组或对象
          const { array, object } = command.parameters;
          let items: any[] = [];
          
          if (array && Array.isArray(array)) {
            items = array;
          } else if (object && typeof object === 'object') {
            items = Object.entries(object);
          } else {
            return this.createErrorResult('Foreach loop requires an array or object');
          }
          
          for (let i = 0; i < items.length; i++) {
            if (iterations >= maxIterations) {
              context.logger.warn(`Foreach loop exceeded maximum iterations: ${maxIterations}`);
              break;
            }
            
            const item = items[i];
            
            // 设置循环变量
            if (variable) {
              context.stateManager.setVariable(variable, item);
            }
            if (command.parameters.indexVariable) {
              context.stateManager.setVariable(command.parameters.indexVariable, i);
            }
            
            const results = await executor.executeCommands(commands);
            executionResults.push(...results);
            
            if (this.shouldBreakLoop(results)) {
              break;
            }
            
            iterations++;
          }
          break;
          
        default:
          return this.createErrorResult(`Unsupported loop type: ${loopType}`);
      }
      
      // 检查是否有子指令执行失败
      const hasFailures = executionResults.some(result => !result.success);
      
      return this.createSuccessResult({
        loopType,
        iterations,
        commandsExecuted: executionResults.length,
        childResults: executionResults
      }, hasFailures ? 'Some commands in loop failed to execute' : undefined);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('Loop execution failed', { error: errorMessage, command });
      return this.createErrorResult(errorMessage);
    }
  }
  
  /**
   * 检查是否应该跳出循环
   * 查找break指令的执行结果
   */
  private shouldBreakLoop(results: CommandResult[]): boolean {
    return results.some(result => 
      result.success && 
      result.data && 
      result.data.action === 'break'
    );
  }
  
  /**
   * 检查是否应该跳过当前迭代
   * 查找continue指令的执行结果
   */
  private shouldContinueLoop(results: CommandResult[]): boolean {
    return results.some(result => 
      result.success && 
      result.data && 
      result.data.action === 'continue'
    );
  }
  
  /**
   * 评估循环条件
   */
  private evaluateCondition(condition: Condition, context: CommandContext): boolean {
    try {
      const { type, key, operator, value, expression } = condition;
      
      if (type === 'expression' && expression) {
        return this.evaluateExpression(expression, context);
      }
      
      let actualValue: any;
      
      if (type === 'variable' && key) {
        actualValue = context.stateManager.getVariable(key);
      } else if (type === 'switch' && key) {
        actualValue = context.stateManager.getSwitch(key);
      } else {
        return false;
      }
      
      return this.compareValues(actualValue, operator, value);
    } catch (error) {
      context.logger.error('Condition evaluation failed', { condition, error });
      return false;
    }
  }
  
  /**
   * 比较两个值
   */
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'gt': return actual > expected;
      case 'lt': return actual < expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      case 'contains': 
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;
      default: return false;
    }
  }
  
  /**
   * 简单的表达式求值
   */
  private evaluateExpression(expression: string, context: CommandContext): boolean {
    try {
      // 简单的变量替换
      let processedExpression = expression;
      
      // 替换变量引用 ${variableName}
      processedExpression = processedExpression.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        const value = context.stateManager.getVariable(varName.trim());
        return JSON.stringify(value);
      });
      
      // 使用Function构造器安全地求值
      const result = new Function('return ' + processedExpression)();
      return Boolean(result);
    } catch (error) {
      context.logger.error('Expression evaluation failed', { expression, error });
      return false;
    }
  }
}