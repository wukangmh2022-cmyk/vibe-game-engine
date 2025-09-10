import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 等待指令处理器
 */
export class WaitHandler extends BaseCommandHandler {
  readonly type = CommandType.WAIT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { duration } = command.parameters;
    
    if (typeof duration !== 'number' || duration < 0) {
      return this.createErrorResult('Invalid duration parameter');
    }

    try {
      context.logger.debug(`Waiting for ${duration}ms`);
      
      await new Promise(resolve => setTimeout(resolve, duration));
      
      return this.createSuccessResult({ duration });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Wait failed: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['duration'];
  }
}