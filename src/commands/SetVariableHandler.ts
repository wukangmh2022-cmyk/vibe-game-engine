import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { ExpressionParser } from '../utils/ExpressionParser';

/**
 * 设置变量指令处理器
 */
export class SetVariableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_VARIABLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { key, name, expression = false } = command.parameters;
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

      // 如果启用了表达式解析，则解析表达式
      if (expression && typeof value === 'string') {
        const parser = new ExpressionParser(stateManager);
        value = parser.parse(value);
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