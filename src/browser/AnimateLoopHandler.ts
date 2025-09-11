import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';

export class AnimateLoopHandler extends BaseCommandHandler {
  readonly type = CommandType.ANIMATE_LOOP;
  private animator = new Animator();

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = p.elementId;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');
    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : null;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);
    const loopType: string = p.loopType || 'hoverY';
    if (loopType === 'hoverY') {
      this.animator.loopHoverY(node, p.amplitude ?? 6, p.duration ?? 1500);
    } else if (loopType === 'pulse') {
      this.animator.loopPulseScale(node, p.minScale ?? 0.95, p.maxScale ?? 1.05, p.duration ?? 1200);
    }
    return this.createSuccessResult({ elementId: id, loopType });
  }
}

