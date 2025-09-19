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
    // ensure overlay exists using stored or provided resource id
    try {
      const rm: any = (context as any).renderManager;
      const P = (globalThis as any).PIXI || rm?.getPixi?.();
      if (P) {
        const ensure = () => {
          if ((node as any).__selectOverlay) return (node as any).__selectOverlay;
          const rid = p.overlayResourceId || (node as any).__overlayResId;
          let tex: any = null;
          try {
            const resMgr: any = (context as any).resourceManager;
            const r = rid ? resMgr?.getResource?.(rid) : null;
            const url = r?.url || r?.src;
            tex = url ? P.Texture.from(url) : null;
          } catch { tex = null; }
          if (!tex) {
            const g = new P.Graphics();
            try { g.lineStyle?.(3, 0x00ff88, 1); g.beginFill(0x00ff88, 0.25); } catch {}
            g.drawCircle(0, 0, 20); g.endFill?.();
            tex = (rm?.getApp?.()?.renderer || rm?.app?.renderer)?.generateTexture(g);
            g.destroy();
          }
         const s = new P.Sprite(tex);
         s.anchor?.set?.(0.5);
         try {
           const ax = (node as any).anchor && typeof (node as any).anchor.x === 'number' ? (node as any).anchor.x : 0;
           const ay = (node as any).anchor && typeof (node as any).anchor.y === 'number' ? (node as any).anchor.y : 0;
           if (Math.abs(ax - 0.5) < 1e-3 && Math.abs(ay - 0.5) < 1e-3) { s.x = 0; s.y = 0; }
           else { s.x = ((node as any).width || 0) / 2; s.y = ((node as any).height || 0) / 2; }
         } catch { s.x = ((node as any).width || 0) / 2; s.y = ((node as any).height || 0) / 2; }
         try { (node as any).sortableChildren = true; s.zIndex = 9999; } catch {}
         try { (s as any).eventMode = 'none'; (s as any).interactive = false; } catch {}
         try {
           const nw = (node as any).width || 0, nh = (node as any).height || 0;
           if (s.width && s.height && nw && nh) {
             const ratio = Math.min(1, Math.min(nw, nh) / (Math.max(s.width, s.height) * 1.8));
             if (ratio > 0 && ratio < 1e3) s.scale?.set?.(ratio);
           }
         } catch {}
         (node as any).addChild?.(s);
         (node as any).__selectOverlay = s;
         return s;
        };
        ensure();
      }
    } catch {}
    try { if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0; (node as any).__animToken++; } catch {}

    // toggle overlay visibility
    try { if ((node as any).__selectOverlay) (node as any).__selectOverlay.visible = selected; } catch {}

    if (selected) {
      const eff = p.effect || (node as any).__selectEffect || 'pulse';
      if (eff === 'pulse') this.animator.loopPulseScale(node, 0.95, 1.05, 900);
    } else {
      try { this.animator.stop(node); } catch {}
      if ((node as any).scale) { (node as any).scale.x = 1; (node as any).scale.y = 1; }
    }
    return this.createSuccessResult({ elementId: id, selected });
  }
}
