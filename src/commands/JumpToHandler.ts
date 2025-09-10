import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class JumpToHandler extends BaseCommandHandler {
  readonly type = CommandType.JUMP_TO;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { target } = command.parameters;
    
    if (!target) {
      return this.createErrorResult('Missing required parameter: target');
    }

    try {
      // 触发跳转事件
      context.eventManager.emit('jump_to_requested', { target });
      
      return this.createSuccessResult({ target }, target);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to jump to target: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['target'];
  }
}