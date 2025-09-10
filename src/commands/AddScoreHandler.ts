import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class AddScoreHandler extends BaseCommandHandler {
  readonly type = CommandType.ADD_SCORE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { points } = command.parameters;
    
    if (typeof points !== 'number') {
      return this.createErrorResult('Invalid points parameter');
    }

    try {
      const stateManager = (context as any).stateManager;
      if (!stateManager) {
        return this.createErrorResult('State manager not available');
      }

      const oldScore = stateManager.getScore();
      stateManager.addScore(points);
      const newScore = stateManager.getScore();
      
      return this.createSuccessResult({ oldScore, newScore, points });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to add score: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['points'];
  }
}