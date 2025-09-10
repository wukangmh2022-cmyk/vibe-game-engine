import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class PlaySoundHandler extends BaseCommandHandler {
  readonly type = CommandType.PLAY_SOUND;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { soundId, volume = 1, loop = false } = command.parameters;
    
    if (!soundId) {
      return this.createErrorResult('Missing required parameter: soundId');
    }

    try {
      const audioInstance = context.audioManager.playSound(soundId, { volume, loop });
      
      return this.createSuccessResult({ soundId, volume, loop });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to play sound: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['soundId'];
  }
}