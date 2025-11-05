import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveFromBraces } from '../utils/ParamResolver';

/**
 * 设置开关指令处理器
 */
export class SetSwitchHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SWITCH;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { key } = command.parameters;
    let { value } = command.parameters;
    
    if (!key) {
      return this.createErrorResult('Missing required parameter: key');
    }

    // 支持从变量占位 {var} 解析
    value = resolveFromBraces<any>(value, context);
    let boolValue: boolean;
    if (typeof value === 'boolean') boolValue = value;
    else if (typeof value === 'number') boolValue = value !== 0;
    else if (typeof value === 'string') {
      const s = value.trim().toLowerCase();
      if (s === 'true' || s === '1') boolValue = true;
      else if (s === 'false' || s === '0' || s === '') boolValue = false;
      else boolValue = true;
    } else {
      boolValue = Boolean(value);
    }

    try {
      const stateManager = (context as any).stateManager;
      if (!stateManager) {
        return this.createErrorResult('State manager not available');
      }

      if (command.parameters?.temporary) {
        stateManager.setTempSwitch?.(key, boolValue);
      } else {
        stateManager.setSwitch(key, boolValue);
      }
      
      context.logger.debug(`Switch set: ${key} = ${boolValue}`);
      
      return this.createSuccessResult({ key, value: boolValue });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to set switch: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['key', 'value'];
  }
}
