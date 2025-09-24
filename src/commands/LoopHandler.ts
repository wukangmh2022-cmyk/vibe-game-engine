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
        loopType = 'while', 
        count = 1, 
        condition, 
        variable, 
        start = 0, 
        end = 1, 
        step = 1,
        commands = [],
        maxIterations = 100000 // 防止无限循环
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
      // 轻量日志辅助（可通过控制台过滤 [loop]）
      const log = (...args: any[]) => { try { (context as any)?.logger?.info?.('[loop]', ...args); } catch { try { console.info('[loop]', ...args); } catch {} } };
      const loopId = (command as any)?.id || 'loop';
      
      // 优先按条件驱动：若提供了 condition 且未显式声明 for/foreach，则强制走 while
      const mode = (loopType === 'for' || loopType === 'foreach') ? loopType : (condition ? 'while' : loopType);

      switch (mode) {
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
              log(loopId, 'for(var)', 'iter', iterations, 'i', i, 'begin');
              const results = await executor.executeCommands(commands);
              executionResults.push(...results);
              
              // 检查是否有break或continue指令
              if (this.shouldBreakLoop(results)) {
                log(loopId, 'break', 'iter', iterations);
                break;
              }
              // 若本迭代内触发了 JUMP（JUMP_TO），立即结束当前循环并返回，由外部顺序恢复逻辑接管
              if (this.shouldExitOnJump(results)) {
                log(loopId, 'jump', 'iter', iterations);
          return this.createSuccessResult({ loopType: mode, iterations: iterations + 1, commandsExecuted: (executionResults || []).length, childResults: executionResults });
              }
              if (this.shouldContinueLoop(results)) { log(loopId, 'continue', 'iter', iterations); iterations++; continue; }
              log(loopId, 'end', 'iter', iterations);
              
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
              log(loopId, 'for(count)', 'iter', iterations, 'i', i, 'begin');
              const results = await executor.executeCommands(commands);
              executionResults.push(...results);
              
              if (this.shouldBreakLoop(results)) {
                log(loopId, 'break', 'iter', iterations);
                break;
              }
              if (this.shouldExitOnJump(results)) {
                log(loopId, 'jump', 'iter', iterations);
          return this.createSuccessResult({ loopType: mode, iterations: iterations + 1, commandsExecuted: (executionResults || []).length, childResults: executionResults });
              }
              if (this.shouldContinueLoop(results)) { log(loopId, 'continue', 'iter', iterations); iterations++; continue; }
              log(loopId, 'end', 'iter', iterations);
              
              iterations++;
            }
          }
          break;
          
        case 'while':
          // while循环：暂时忽略条件判断，强制进入循环体；仍保留最大轮次保护与 break/continue/jump 语义
          while (true) {
            if (iterations >= maxIterations) {
              context.logger.warn(`While loop exceeded maximum iterations: ${maxIterations}`);
              break;
            }
            
            if (variable) {
              context.stateManager.setVariable(variable, iterations);
            }
            log(loopId, 'while', 'iter', iterations, 'begin');
            const results = await executor.executeCommands(commands);
            executionResults.push(...results);
            
            if (this.shouldBreakLoop(results)) {
              log(loopId, 'break', 'iter', iterations);
              break;
            }
            if (this.shouldExitOnJump(results)) {
              log(loopId, 'jump', 'iter', iterations);
          return this.createSuccessResult({ loopType: mode, iterations: iterations + 1, commandsExecuted: (executionResults || []).length, childResults: executionResults });
            }
            if (this.shouldContinueLoop(results)) { log(loopId, 'continue', 'iter', iterations); iterations++; continue; }
            log(loopId, 'end', 'iter', iterations);
            
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
            log(loopId, 'foreach', 'iter', iterations, 'i', i, 'begin');
            const results = await executor.executeCommands(commands);
            executionResults.push(...results);
            
            if (this.shouldBreakLoop(results)) {
              log(loopId, 'break', 'iter', iterations);
              break;
            }
            if (this.shouldExitOnJump(results)) {
              log(loopId, 'jump', 'iter', iterations);
            return this.createSuccessResult({ loopType: mode, iterations: iterations + 1, commandsExecuted: (executionResults || []).length, childResults: executionResults });
            }
            log(loopId, 'end', 'iter', iterations);
            
            iterations++;
          }
          break;
          
        default:
          return this.createErrorResult(`Unsupported loop type: ${loopType}`);
      }
      
      // 检查是否有子指令执行失败
      const hasFailures = executionResults.some(result => !result.success);
      
      return this.createSuccessResult({
        loopType: mode,
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
   * 检测本迭代是否触发了 JUMP（JUMP_TO）
   * 触发后当前循环体应立即结束，交给运行时顺序恢复
   */
  private shouldExitOnJump(results: CommandResult[]): boolean {
    return results.some(result => result?.success && (result as any)?.data?.action === 'jump');
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
