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
    const ex: any = (context as any).executor;
    if (ex && typeof ex.isAborted === 'function' && ex.isAborted()) {
      return this.createSuccessResult({ aborted: true });
    }

    context.logger.debug(`Waiting for ${duration}ms`);
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      const id = setTimeout(done, duration);
      if (ex && typeof ex.registerAbortable === 'function') {
        ex.registerAbortable(() => { clearTimeout(id); done(); });
      }
    });
    return this.createSuccessResult({ duration });
  }

  protected getRequiredParameters(): string[] {
    return ['duration'];
  }
}
