import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveIdFromBraces } from '../utils/ParamResolver';
import { Animator } from '../browser/Animator';

export class SetSelectedHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SELECTED;//'set_selected';
  private animator = new Animator();

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    let id: string | undefined = resolveIdFromBraces(p.elementId, context);
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);
    const animTarget: any = (node as any).__animLayer || node;
    const elementNode: any = (node as any).__elementNode;

    const selected = !!p.selected;
    // 记录最近变更选中状态的元素ID，便于后续指令或事件引用
    (context as any).stateManager?.setVariable?.('lastChangingSelectStateID', id);
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
         (animTarget as any).addChild?.(s);
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
      const eff = p.effect || (node as any).__selectEffect || '';
      if (eff === 'pulse') {
        this.animator.loopPulseScale(animTarget, 0.95, 1.05, 900);
      } else if (typeof eff === 'string' && eff.trim()) {
        try { await elementNode?.setEntryTimeline?.(eff.trim(), { resolver: (spec: string) => this.loadAnimationData(spec, context) }); } catch {}
      }
    } else {
      try { this.animator.stop(animTarget); } catch {}
      if ((animTarget as any).scale) { (animTarget as any).scale.x = 1; (animTarget as any).scale.y = 1; }
      try { elementNode?.clearLoopTimeline?.(); } catch {}
    }
    return this.createSuccessResult({ elementId: id, selected });
  }

  private async loadAnimationData(specIdOrUrl: string, context: CommandContext): Promise<any | null> {
    try {
      const url = await this.resolveAnimationUrl(specIdOrUrl, context);
      if (!url || typeof (globalThis as any).fetch !== 'function') return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  private async resolveAnimationUrl(spec: string, context: CommandContext): Promise<string | null> {
    if (!spec) return null;
    const rm: any = (context as any).resourceManager;
    const res = rm?.getResource ? rm.getResource(spec) : null;
    return res?.url || (typeof spec === 'string' ? spec : null);
  }

}
