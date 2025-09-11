import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class PixiCheckInAreaHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_IN_AREA;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const aId: string = p.elementA;
    const bId: string = p.elementB;
    if (!aId || !bId) return this.createErrorResult('Missing required parameter: elementA/elementB');

    const rm: any = context.renderManager as any;
    const a = rm?.getNode ? rm.getNode(aId) : null;
    const b = rm?.getNode ? rm.getNode(bId) : null;
    if (!a || !b) return this.createErrorResult(`Element not found: ${!a ? aId : bId}`);

    const ab = a.getBounds();
    const bb = b.getBounds();
    const intersect = !(ab.x + ab.width < bb.x || ab.x > bb.x + bb.width || ab.y + ab.height < bb.y || ab.y > bb.y + bb.height);

    const exec = (context as any).executor;
    if (intersect && Array.isArray(p.trueCommands)) {
      await exec.executeCommands(p.trueCommands);
    } else if (!intersect && Array.isArray(p.falseCommands)) {
      await exec.executeCommands(p.falseCommands);
    }

    return this.createSuccessResult({ intersect });
  }

  protected getRequiredParameters(): string[] { return ['elementA', 'elementB']; }
}

