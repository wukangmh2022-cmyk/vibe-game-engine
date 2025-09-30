import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';
import { Easings } from './anim/Easings';
import { resolveIdFromBraces } from '../utils/ParamResolver';

// Cache parsed animation JSON to avoid repeated fetch/allocations
const ANIM_JSON_CACHE: Map<string, any> = new Map();

export class AnimateInHandler extends BaseCommandHandler {
  readonly type = CommandType.ANIMATE_IN;
  private animator = new Animator();

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = resolveIdFromBraces(p.elementId, context) as any;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');
    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : null;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const elementNode: any = (node as any).__elementNode;
    const animTarget: any = (node as any).__animLayer || node;

    const preset: string = p.preset || 'fade';
    const duration: number = p.duration ?? 800;
    const easing: keyof typeof Easings = p.easing || (preset === 'bounce' ? 'easeOutBounce' : preset === 'back' ? 'easeOutBack' : preset === 'elastic' ? 'easeOutElastic' : 'easeOutQuad');

    const useResource = !!(p.animId || p.animationId);
    if (useResource && elementNode) {
      const spec = p.animId || p.animationId;
      try {
        await elementNode.setEntryTimeline(spec, { duration: p.duration, resolver: (id: string) => this.loadAnimationData(id, context) });
      } catch {}
      return this.createSuccessResult({ elementId: id, animId: spec, nonBlocking: true });
    }

    let from: any = p.from ? { ...p.from } : {};
    let to: any = p.to ? { ...p.to } : {};

    if (!p.from && !p.to) {
      switch (preset) {
        case 'fade':
          from = { alpha: 0 };
          to = { alpha: 1 };
          break;
        case 'bounce':
          from = { y: -40, alpha: 0.8 };
          to = { y: 0, alpha: 1 };
          break;
        case 'scaleIn':
          from = { scale: 0.2, alpha: 0.8 };
          to = { scale: 1, alpha: 1 };
          break;
        case 'moveIn': {
          const dir = p.direction || 'up';
          const offset = p.offset ?? 60;
          if (dir === 'up') from = { y: offset, alpha: 0.8 };
          else if (dir === 'down') from = { y: -offset, alpha: 0.8 };
          else if (dir === 'left') from = { x: offset, alpha: 0.8 };
          else from = { x: -offset, alpha: 0.8 };
          to = { x: 0, y: 0, alpha: 1 };
          break;
        }
        default:
          from = { alpha: 0 };
          to = { alpha: 1 };
          break;
      }
    }

    try { elementNode?.resetAnimation?.(); } catch {}
    this.animator.animate(animTarget, from, to, duration, easing);
    return this.createSuccessResult({ elementId: id, preset, duration, easing, nonBlocking: true });
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
