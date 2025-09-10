import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 设置开关指令处理器
 */
export class SetSwitchHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SWITCH;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { key, value } = command.parameters;
    
    if (!key) {
      return this.createErrorResult('Missing required parameter: key');
    }

    const boolValue = Boolean(value);

    try {
      const stateManager = (context as any).stateManager;
      if (!stateManager) {
        return this.createErrorResult('State manager not available');
      }

      stateManager.setSwitch(key, boolValue);
      
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