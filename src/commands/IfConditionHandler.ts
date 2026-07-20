import { CommandType, GameCommand, CommandContext, CommandResult, Condition } from '../types';
import { BaseCommandHandler, CommandExecutor } from '../core/CommandExecutor';
import { getGlobalCommandModifiers } from '../core/commandModifiers';

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
        if (!context.executor) {
          try { executor.setCommandModifiers(getGlobalCommandModifiers()); } catch {}
        }
        
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
    // 严格比较，不做隐式类型转换；类型统一由编辑器侧完成
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
    // 支持：
    //  - event.* （自动替换为 eventVar.*）
    //  - getVar('key') 读取变量
    try {
      const eventVar = (context as any).event || (context as any).lastEvent || (globalThis as any).event;
      const sm: any = (context as any).stateManager;
      const getVar = (key: string) => (sm && typeof sm.getVariable === 'function') ? sm.getVariable(String(key)) : undefined;
      const expr = String(expression || '').replace(/\bevent\b/g, 'eventVar');
      // eslint-disable-next-line no-eval
      return Boolean(eval(expr));
    } catch {
      return false;
    }
  }

  protected getRequiredParameters(): string[] {
    return ['condition'];
  }
}
