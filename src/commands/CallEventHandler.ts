import { CommandType, GameCommand, CommandContext, CommandResult, EventConfig } from '../types';
import { BaseCommandHandler, CommandExecutor } from '../core/CommandExecutor';

/**
 * 事件调用指令处理器
 * 用于调用预定义的事件，执行事件中的指令序列
 */
export class CallEventHandler extends BaseCommandHandler {
  readonly type = CommandType.CALL_EVENT;
  
  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { eventId, parameters = {} } = command.parameters;
      
      if (!eventId) {
        return this.createErrorResult('Missing eventId parameter');
      }
      
      // 查找事件配置
      const event = await this.findEvent(eventId, context);
      if (!event) {
        return this.createErrorResult(`Event not found: ${eventId}`);
      }
      
      // 检查事件条件
      if (event.conditions && event.conditions.length > 0) {
        const conditionsMet = event.conditions.every(condition => 
          this.evaluateCondition(condition, context)
        );
        
        if (!conditionsMet) {
          return this.createSuccessResult({
            eventId,
            executed: false,
            reason: 'Event conditions not met'
          });
        }
      }
      
      // 设置事件参数到上下文变量中
      if (parameters && typeof parameters === 'object') {
        for (const [key, value] of Object.entries(parameters)) {
          context.stateManager.setVariable(`event_${key}`, value);
        }
      }
      
      let executionResults: CommandResult[] = [];
      
      if (event.commands && event.commands.length > 0) {
        // 创建CommandExecutor来执行事件指令
        const executor = new CommandExecutor(
          context.stateManager,
          context.eventManager,
          context.resourceManager,
          context.renderManager,
          context.audioManager,
          context.logger
        );
        
        // 执行事件中的指令
        executionResults = await executor.executeCommands(event.commands);
      }
      
      // 清理事件参数
      if (parameters && typeof parameters === 'object') {
        for (const key of Object.keys(parameters)) {
          context.stateManager.setVariable(`event_${key}`, undefined);
        }
      }
      
      // 检查是否有子指令执行失败
      const hasFailures = executionResults.some(result => !result.success);
      
      return this.createSuccessResult({
        eventId,
        executed: true,
        commandsExecuted: executionResults.length,
        childResults: executionResults
      }, hasFailures ? 'Some commands in event failed to execute' : undefined);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('Event call execution failed', { error: errorMessage, command });
      return this.createErrorResult(errorMessage);
    }
  }
  
  /**
   * 查找事件配置
   * 这里需要根据实际的事件存储机制来实现
   */
  private async findEvent(eventId: string, context: CommandContext): Promise<EventConfig | null> {
    try {
      // 尝试从事件管理器获取事件
      // 这里假设事件管理器有getEvent方法
      if ('getEvent' in context.eventManager && typeof context.eventManager.getEvent === 'function') {
        return await (context.eventManager as any).getEvent(eventId);
      }
      
      // 如果事件管理器没有getEvent方法，尝试从状态管理器获取
      if ('getEvent' in context.stateManager && typeof context.stateManager.getEvent === 'function') {
        return await (context.stateManager as any).getEvent(eventId);
      }
      
      // 如果都没有，记录警告并返回null
      context.logger.warn(`No event retrieval method available for eventId: ${eventId}`);
      return null;
      
    } catch (error) {
      context.logger.error('Failed to find event', { eventId, error });
      return null;
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
  
  /**
   * 获取必需参数列表
   */
  protected getRequiredParameters(): string[] {
    return ['eventId'];
  }
}