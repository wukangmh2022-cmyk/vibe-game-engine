import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveElementId } from '../utils/ParamResolver';

export class StopAnimationHandler extends BaseCommandHandler {
  readonly type = CommandType.STOP_ANIMATION as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p: any = command.parameters || {};
    const id: string | undefined = resolveElementId(p.elementId, context);
    if (!id) return this.createErrorResult('Missing required parameter: elementId');
    try {
      const rm: any = (context as any).renderManager;
      const node: any = rm?.getNode ? rm.getNode(id) : undefined;
      if (!node) return this.createErrorResult(`Element not found: ${id}`);
      const elementNode: any = (node as any).__elementNode;
      try { elementNode?.clearLoopTimeline?.(); } catch {}
      try { elementNode?.resetAnimation?.(); } catch {}
      const AnimatorCls: any = (require('../browser/Animator') as any).Animator;
      try { const anim = new AnimatorCls(); anim.stop((node as any).__animLayer || node); } catch {}
      try { if ((node as any).__animLayer?.scale) { (node as any).__animLayer.scale.x = 1; (node as any).__animLayer.scale.y = 1; } } catch {}
      return this.createSuccessResult({ elementId: id, stopped: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.createErrorResult(`Failed to stop animation: ${msg}`);
    }
  }
}

export default StopAnimationHandler;
