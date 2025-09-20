import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { ExpressionParser } from '../utils/ExpressionParser';

/**
 * 设置变量指令处理器
 */
export class SetVariableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_VARIABLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { key, name, expression = false, op } = command.parameters;
    let { value } = command.parameters;
    const variableKey = key || name;
    
    if (!variableKey) {
      return this.createErrorResult('Missing required parameter: key or name');
    }

    try {
      // 通过事件管理器获取状态管理器
      const stateManager = (context as any).stateManager;
      if (!stateManager) {
        return this.createErrorResult('State manager not available');
      }

      // 新：支持 op + 数值 的简化模式（不再需要表达式）
      // op: 'set'|'add'|'sub'|'mul'|'div'，value: number
      if (op) {
        let next: any;
        if (op === 'set') {
          // 直接按原值设置，仅支持 boolean/number/string
          if (value && typeof value === 'object') {
            return this.createErrorResult('Invalid value: object is not allowed. Use numeric/string/boolean or expression string.');
          }
          next = value;
        } else {
          const current = Number(stateManager.getVariable(variableKey) ?? 0);
          const num = typeof value === 'number' ? value : Number(value);
          if (Number.isNaN(current) || Number.isNaN(num)) {
            return this.createErrorResult('Numeric operation requires numeric values');
          }
          switch (op) {
            case 'add': next = current + num; break;
            case 'sub': next = current - num; break;
            case 'mul': next = current * num; break;
            case 'div': next = num === 0 ? current : current / num; break;
            default: return this.createErrorResult(`Unknown op: ${op}`);
          }
        }
        stateManager.setVariable(variableKey, next);
        context.logger.debug(`Variable ${variableKey} op=${op} set to ${next}`);
        return this.createSuccessResult({ key: variableKey, value: next, op });
      }

      // 兼容：保留表达式模式（旧数据）
      if (expression && typeof value === 'string') {
        const parser = new ExpressionParser(stateManager);
        value = parser.parse(value);
      }
      // 若传入对象但未声明 expression=true，则判为无效（避免兼容错误 JSON）
      if (!expression && value && typeof value === 'object') {
        return this.createErrorResult('Invalid value: object not supported. Set expression=true and provide an expression string, or use op+value.');
      }

      stateManager.setVariable(variableKey, value);
      
      context.logger.debug(`Variable set: ${variableKey} = ${value}`);
      
      return this.createSuccessResult({ 
        key: variableKey, 
        value,
        expression,
        message: `Variable '${variableKey}' set to '${value}'${expression ? ' (expression evaluated)' : ''}`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to set variable: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return []; // 不强制要求特定参数名，在execute中检查
  }
}
