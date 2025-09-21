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
    // stop previous custom loop if any
    try { if ((node as any).__loopCancel) { (node as any).__loopCancel(); (node as any).__loopCancel = null; } } catch {}
    const animId: string | undefined = p.animId || p.animationId;
    if (animId) {
      // resource-based timeline looping
      const tryFetch = async (u: string): Promise<any | null> => { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch {} return null; };
      const resolveUrl = async (spec: string): Promise<string | null> => {
        const rmAny: any = (context as any).resourceManager; const res = rmAny?.getResource?.(spec);
        return res?.url || (typeof spec === 'string' ? spec : null);
      };
      const toProps = (p: any) => {
        const out: any = {};
        if (p.alpha != null) out.alpha = p.alpha;
        if (p.x != null) out.x = p.x;
        if (p.y != null) out.y = p.y;
        if (p.scaleX != null || p.scaleY != null || p.scale != null) {
          const sx = p.scale?.x ?? p.scaleX; const sy = p.scale?.y ?? p.scaleY;
          if (sx != null || sy != null) out.scale = { x: sx ?? 1, y: sy ?? 1 };
        }
        return out;
      };
      const getState = () => ({ alpha: (node as any).alpha ?? 1, x: (node as any).x ?? 0, y: (node as any).y ?? 0, scale: { x: (node as any).scale?.x ?? 1, y: (node as any).scale?.y ?? 1 } });
      const runLoop = async () => {
        let stopped = false;
        const cancel = () => { stopped = true; };
        (node as any).__loopCancel = cancel; (node as any).__loopAnimId = animId;
        while (!stopped) {
          try {
            const url = await resolveUrl(animId);
            if (!url) break;
            let data: any = await tryFetch(url);
            if (!data) {
              try {
                const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
                const base: string = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__ || '';
                if (base && typeof url === 'string' && url.startsWith(base)) {
                  const rel = url.slice(base.length).replace(/^\/+/, '');
                  if (rel.startsWith('animations/')) data = await tryFetch('/' + rel);
                }
              } catch {}
            }
            if (!data || !Array.isArray(data.timeline) || data.timeline.length === 0) break;
            const relative = !!data.relative; const tl = data.timeline.slice().sort((a: any, b: any) => (a.time||0)-(b.time||0));
            // apply first frame then tween segments
            const first = toProps(relative ? (() => { const s = toProps(first?.props||{}); const b = getState(); if (s.x!=null) s.x = (b.x||0)+s.x; if (s.y!=null) s.y=(b.y||0)+s.y; if (s.scale){ if (s.scale.x!=null) s.scale.x=(b.scale?.x||1)+s.scale.x; if (s.scale.y!=null) s.scale.y=(b.scale?.y||1)+s.scale.y;} return s; })() : toProps(tl[0].props||{}));
            await this.animator.animate(node, getState(), first, Math.max(0, (tl[0].time||0)), (tl[0].ease||'easeOutQuad'));
            for (let i=0;i<tl.length-1 && !stopped;i++) {
              const cur = tl[i], nxt = tl[i+1];
              const from = getState();
              const rawTo = toProps(nxt.props||{});
              const to = relative ? (()=>{ const b=getState(); if(rawTo.x!=null) rawTo.x=(b.x||0)+rawTo.x; if(rawTo.y!=null) rawTo.y=(b.y||0)+rawTo.y; if(rawTo.scale){ if(rawTo.scale.x!=null) rawTo.scale.x=(b.scale?.x||1)+rawTo.scale.x; if(rawTo.scale.y!=null) rawTo.scale.y=(b.scale?.y||1)+rawTo.scale.y;} return rawTo; })() : rawTo;
              const dur = Math.max(0, (nxt.time||0)-(cur.time||0));
              await this.animator.animate(node, from, to, dur, (nxt.ease||'easeOutQuad') as any);
            }
          } catch {}
        }
      };
      runLoop();
      return this.createSuccessResult({ elementId: id, loopType: 'resource', animId });
    }
    const loopType: string = p.loopType || 'hoverY';
    if (loopType === 'hoverY') {
      this.animator.loopHoverY(node, p.amplitude ?? 6, p.duration ?? 1500);
    } else if (loopType === 'pulse') {
      this.animator.loopPulseScale(node, p.minScale ?? 0.95, p.maxScale ?? 1.05, p.duration ?? 1200);
    }
    return this.createSuccessResult({ elementId: id, loopType });
  }
}
