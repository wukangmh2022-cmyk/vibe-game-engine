import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { ExpressionParser } from '../utils/ExpressionParser';
import { resolveFromBraces, resolveNumberFromBraces } from '../utils/ParamResolver';

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
          // 支持从变量占位 {var} 解析
          const resolved = resolveFromBraces<any>(value, context);
          value = resolved;
          if (value && typeof value === 'object') {
            return this.createErrorResult('Invalid value: object is not allowed. Use numeric/string/boolean or expression string.');
          }
          next = value;
        } else {
          const current = Number(stateManager.getVariable(variableKey) ?? 0);
          // 支持从变量占位 {var} 解析为数字
          const resolvedNum = resolveNumberFromBraces(value, context);
          const num = (resolvedNum != null) ? resolvedNum : (typeof value === 'number' ? value : Number(value));
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
        if (command.parameters?.temporary) {
          stateManager.setTempVariable?.(variableKey, next);
        } else {
          stateManager.setVariable(variableKey, next);
        }
        context.logger.debug(`Variable ${variableKey} op=${op} set to ${next}`);
        return this.createSuccessResult({ key: variableKey, value: next, op });
      }

      // 兼容：保留表达式模式（旧数据）
      if (expression && typeof value === 'string') {
        const parser = new ExpressionParser(stateManager);
        value = parser.parse(value);
      }
      // 若未启用表达式，先解析 {var} 占位
      if (!expression) {
        value = resolveFromBraces<any>(value, context);
      }
      // 若仍为对象，判为无效（避免错误 JSON）
      if (!expression && value && typeof value === 'object') {
        return this.createErrorResult('Invalid value: object not supported. Set expression=true and provide an expression string, or use op+value.');
      }

      if (command.parameters?.temporary) {
        stateManager.setTempVariable?.(variableKey, value);
      } else {
        stateManager.setVariable(variableKey, value);
      }
      
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
