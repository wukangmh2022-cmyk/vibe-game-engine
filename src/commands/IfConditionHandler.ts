import { CommandType, GameCommand, CommandContext, CommandResult, Condition } from '../types';
import { BaseCommandHandler, CommandExecutor } from '../core/CommandExecutor';

export class IfConditionHandler extends BaseCommandHandler {
  readonly type = CommandType.IF_CONDITION;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { condition, trueCommands = [], falseCommands = [] } = command.parameters;
    
    if (!condition) {
      return this.createErrorResult('Missing required parameter: condition');
    }

    try {
      const conditionResult = this.evaluateCondition(condition, context);
      const commandsToExecute = conditionResult ? trueCommands : falseCommands;
      
      let executionResults: CommandResult[] = [];
      
      if (commandsToExecute.length > 0) {
        // 使用context中的executor来执行子指令，确保处理器已注册
        const executor = context.executor || new CommandExecutor(
          context.stateManager,
          context.eventManager,
          context.resourceManager,
          context.renderManager,
          context.audioManager,
          context.logger
        );
        
        // 直接执行子指令，实现真正的树状嵌套
        executionResults = await executor.executeCommands(commandsToExecute);
      }
      
      // 检查是否有子指令执行失败
      const hasFailures = executionResults.some(result => !result.success);
      
      return this.createSuccessResult({ 
        conditionResult, 
        executedBranch: conditionResult ? 'true' : 'false',
        commandCount: commandsToExecute.length,
        childResults: executionResults
      }, hasFailures ? 'Some child commands failed to execute' : undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to evaluate condition: ${errorMessage}`);
    }
  }

  private evaluateCondition(condition: Condition, context: CommandContext): boolean {
    const stateManager = (context as any).stateManager;
    if (!stateManager) {
      throw new Error('State manager not available');
    }

    let value: any;
    
    switch (condition.type) {
      case 'variable':
        value = stateManager.getVariable(condition.key!);
        break;
      case 'switch':
        value = stateManager.getSwitch(condition.key!);
        break;
      case 'expression':
        // 简单的表达式求值，实际项目中可能需要更复杂的实现
        return this.evaluateExpression(condition.expression!, context);
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }

    // Optional debug: print left value before compare
    try {
      const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_CONDITION') === '1';
      if (dbg) {
        const op = condition.operator;
        (context.logger || console).info?.('[IF_CONDITION] compare', { key: condition.key, left: value, operator: op, right: condition.value });
      }
    } catch {}

    return this.compareValues(value, condition.operator, condition.value);
  }

  private compareValues(left: any, operator: string, right: any): boolean {
    switch (operator) {
      case 'eq': return left === right;
      case 'ne': return left !== right;
      case 'gt': return left > right;
      case 'lt': return left < right;
      case 'gte': return left >= right;
      case 'lte': return left <= right;
      case 'in': return Array.isArray(right) && right.includes(left);
      case 'contains': return String(left).includes(String(right));
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  private evaluateExpression(expression: string, context: CommandContext): boolean {
    // 尝试注入事件作用域，支持在表达式中使用 event.*
    try {
      const eventVar = (context as any).event || (context as any).lastEvent || (globalThis as any).event;
      // 将表达式中的 event 替换为 eventVar 变量
      // 注意：eval 仍不安全，这里仅为兼容数据；后续可替换为安全解析器
      // eslint-disable-next-line no-eval
      return Boolean(eval(expression.replace(/\bevent\b/g, 'eventVar')));
    } catch {
      return false;
    }
  }

  protected getRequiredParameters(): string[] {
    return ['condition'];
  }
}
