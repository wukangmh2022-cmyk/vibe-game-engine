import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';

const ANIM_JSON_CACHE: Map<string, any> = new Map();

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

    const elementNode: any = (node as any).__elementNode;
    const animTarget: any = (node as any).__animLayer || node;

    try { if ((node as any).__loopCancel) { (node as any).__loopCancel(); (node as any).__loopCancel = null; } } catch {}

    const animId: string | undefined = p.animId || p.animationId;
    const durationOverride = p.duration ?? p.period ?? p.cycle ?? (p.seconds != null ? Number(p.seconds) * 1000 : undefined);

    if (animId && elementNode) {
      // Pre-resolve to ensure资源存在；若失败则回退到预设 loopType
      let data: any | null = null;
      try { data = await this.loadAnimationData(animId, context); } catch { data = null; }
      if (data && data.timeline) {
        try { await elementNode.setLoopTimeline(animId, { timeline: data, duration: durationOverride, resolver: (id: string) => this.loadAnimationData(id, context) }); } catch {}
      } else {
        // fallback to preset below
      }
      (node as any).__loopAnimId = animId;
      (node as any).__loopCancel = () => { try { elementNode.clearLoopTimeline(); } catch {} };

      if (!(node as any).__loopPauseHandlers && (node as any).on) {
        const onDown = () => { try { elementNode.clearLoopTimeline(); } catch {} };
        const onUp = () => {
          const aid = (node as any).__loopAnimId;
          if (aid) {
            try { elementNode.setLoopTimeline(aid, { duration: durationOverride, resolver: (id: string) => this.loadAnimationData(id, context) }); } catch {}
          }
        };
        (node as any).on('pointerdown', onDown);
        (node as any).on('pointerup', onUp);
        (node as any).on('pointerupoutside', onUp);
        (node as any).__loopPauseHandlers = { onDown, onUp };
      }

      if (data && data.timeline) {
        return this.createSuccessResult({ elementId: id, loopType: 'resource', animId });
      }
    }

    const loopType: string = p.loopType || 'hoverY';
    try { elementNode?.clearLoopTimeline?.(); } catch {}
    this.animator.stop(animTarget);

    if (loopType === 'hoverY') {
      this.animator.loopHoverY(animTarget, p.amplitude ?? 6, p.duration ?? 1500);
    } else if (loopType === 'pulse') {
      this.animator.loopPulseScale(animTarget, p.minScale ?? 0.95, p.maxScale ?? 1.05, p.duration ?? 1200);
    }
    return this.createSuccessResult({ elementId: id, loopType });
  }

  private async loadAnimationData(specIdOrUrl: string, context: CommandContext): Promise<any | null> {
    try {
      const url = await this.resolveAnimationUrl(specIdOrUrl, context);
      if (!url || typeof (globalThis as any).fetch !== 'function') return null;
      if (ANIM_JSON_CACHE.has(url)) return ANIM_JSON_CACHE.get(url);
      const tryFetch = async (u: string) => {
        try {
          const resp = await fetch(u, { cache: 'force-cache' as any });
          if (resp.ok) {
            const data = await resp.json();
            ANIM_JSON_CACHE.set(url, data);
            return data;
          }
        } catch {}
        return null;
      };
      let data = await tryFetch(url);
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
      return data;
    } catch {
      return null;
    }
  }

  private async resolveAnimationUrl(spec: string, context: CommandContext): Promise<string | null> {
    if (!spec) return null;
    const rm: any = (context as any).resourceManager;
    const res = rm?.getResource ? rm.getResource(spec) : null;
    if (res?.url) return res.url;
    if (typeof spec !== 'string') return null;
    try {
      const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
      const getVfsUrl = g?.__VFS_GET_URL__;
      const norm = (p: string) => String(p || '').replace(/^\.\//, '').replace(/^\/+/, '');
      const ensureJson = (p: string) => p.endsWith('.json') ? p : (p + '.json');
      const candidates: string[] = [];
      const name = norm(spec);
      if (/\//.test(name)) {
        candidates.push(ensureJson(name.startsWith('animations/') ? name : `animations/${name.replace(/^.*?\//, '')}`));
      } else {
        candidates.push(ensureJson(`animations/${name}`));
        candidates.push(ensureJson(`animations/基础效果/${name}`));
      }
      for (const rel0 of candidates) {
        const rel = norm(rel0);
        if (typeof getVfsUrl === 'function') { const u = await getVfsUrl(rel); if (u) return u; }
        const base: string = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__ || '';
        if (base) return base.endsWith('/') ? (base + rel) : (base + '/' + rel);
      }
      return '/' + candidates[0];
    } catch { return spec; }
  }
}
