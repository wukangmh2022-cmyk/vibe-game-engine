import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';
import { Easings } from './anim/Easings';

export class AnimateInHandler extends BaseCommandHandler {
  readonly type = CommandType.ANIMATE_IN;
  private animator = new Animator();

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = p.elementId;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');
    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : null;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const preset: string = p.preset || 'fade';
    const duration: number = p.duration ?? 800;
    const easing: keyof typeof Easings = p.easing || (preset === 'bounce' ? 'easeOutBounce' : preset === 'back' ? 'easeOutBack' : preset === 'elastic' ? 'easeOutElastic' : 'easeOutQuad');

    let from: any = p.from || {};
    let to: any = p.to || {};
    if (!p.from && !p.to) {
      switch (preset) {
        case 'fade': from = { alpha: 0 }; to = { alpha: 1 }; break;
        case 'bounce': from = { y: node.y - 40, alpha: 0.8 }; to = { y: node.y, alpha: 1 }; break;
        case 'scaleIn': from = { scale: 0.2, alpha: 0.8 }; to = { scale: 1, alpha: 1 }; break;
        case 'moveIn': {
          const dir = p.direction || 'up';
          const offset = p.offset ?? 60;
          if (dir === 'up') from = { y: node.y + offset, alpha: 0.8 }; else if (dir === 'down') from = { y: node.y - offset, alpha: 0.8 }; else if (dir === 'left') from = { x: node.x + offset, alpha: 0.8 }; else from = { x: node.x - offset, alpha: 0.8 };
          to = { x: node.x, y: node.y, alpha: 1 };
          break;
        }
        default: from = { alpha: 0 }; to = { alpha: 1 }; break;
      }
    }

    await this.animator.animate(node, from, to, duration, easing);
    return this.createSuccessResult({ elementId: id, preset, duration, easing });
  }
}

