import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class NextLevelHandler extends BaseCommandHandler {
  readonly type = CommandType.NEXT_LEVEL;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      // 触发下一关事件
      context.eventManager.emit('next_level_requested');
      
      return this.createSuccessResult({ message: 'Next level requested' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to go to next level: ${errorMessage}`);
    }
  }
}