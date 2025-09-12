import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { Animator } from '../browser/Animator';

export class SetSelectedHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SELECTED;//'set_selected';
  private animator = new Animator();

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    let id: string | undefined = p.elementId;
    if (!id && p.elementIdVar && (context as any).stateManager?.getVariable) {
      try { id = (context as any).stateManager.getVariable(p.elementIdVar); } catch {}
    }
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const selected = !!p.selected;
    node.__selected = selected;
    try { if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0; (node as any).__animToken++; } catch {}

    if (selected) {
      const eff = p.effect || 'pulse';
      if (eff === 'pulse') {
        this.animator.loopPulseScale(node, 0.95, 1.05, 900);
      }
    } else {
      if (node.scale) { node.scale.x = 1; node.scale.y = 1; }
    }
    return this.createSuccessResult({ elementId: id, selected });
  }
}
