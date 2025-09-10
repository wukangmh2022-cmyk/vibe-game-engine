import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * Break指令处理器
 * 用于跳出循环
 */
export class BreakHandler extends BaseCommandHandler {
  readonly type = CommandType.BREAK;
  
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { condition } = command.parameters;
      
      // 如果有条件，先评估条件
      if (condition) {
        const shouldBreak = this.evaluateCondition(condition, context);
        if (!shouldBreak) {
          return this.createSuccessResult({
            action: 'continue', // 条件不满足，继续执行
            conditionResult: false
          });
        }
      }
      
      // 返回break信号
      return this.createSuccessResult({
        action: 'break',
        conditionResult: condition ? true : undefined
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('Break execution failed', { error: errorMessage, command });
      return this.createErrorResult(errorMessage);
    }
  }
  
  /**
   * 评估条件
   */
  private evaluateCondition(condition: any, context: CommandContext): boolean {
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