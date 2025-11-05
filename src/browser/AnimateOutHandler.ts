import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';
import { Easings } from './anim/Easings';
import { resolveElementId, interpolateBraces } from '../utils/ParamResolver';

// Cache parsed animation JSON to avoid repeated fetch/allocations
const ANIM_JSON_CACHE: Map<string, any> = new Map();

export class AnimateOutHandler extends BaseCommandHandler {
  readonly type = CommandType.ANIMATE_OUT;
  private animator = new Animator();

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = resolveElementId(p.elementId, context) as any;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');
    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : null;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const elementNode: any = (node as any).__elementNode;
    const animTarget: any = (node as any).__animLayer || node;

    const preset: string = p.preset || 'fade';
    const duration: number = p.duration ?? 600;
    const easing: keyof typeof Easings = p.easing || (preset === 'back' ? 'easeInBack' : 'easeInQuad');
    const hideAfter: boolean = p.hideAfter !== false; // 默认结束后隐藏

    const useResource = !!(p.animId || p.animationId);
    if (useResource && elementNode) {
      const raw = p.animId || p.animationId;
      const spec = (typeof raw === 'string') ? interpolateBraces(raw, context) : raw;
      try {
        // 触发一次性出场时间线（沿用 entry 的接口）
        await elementNode.setEntryTimeline(spec, { duration: p.duration, resolver: (id: string) => this.loadAnimationData(id, context), holdOnEnd: true });
      } catch {}

      // 结束后隐藏（基于资源时间线时长或覆盖时长）
      const ms = await this.resolveTimelineDurationMs(spec, p.duration, context).catch(() => duration);
      if (hideAfter && typeof setTimeout === 'function') {
        setTimeout(() => {
          try {
            context.executor?.executeCommand?.({ id: `hide_${id}_${Date.now()}` as any, type: CommandType.SET_ELEMENT_STYLE as any, parameters: { elementId: id, style: { display: 'none' } } } as any);
          } catch {}
        }, Math.max(0, Number(ms) || duration));
      }
      return this.createSuccessResult({ elementId: id, animId: spec, duration: ms, hideAfter, nonBlocking: true });
    }

    // 预设：从当前状态到“离场”状态
    let from: any = p.from ? { ...p.from } : {};
    let to: any = p.to ? { ...p.to } : {};

    if (!p.from && !p.to) {
      switch (preset) {
        case 'fade':
          from = { alpha: 1 };
          to = { alpha: 0 };
          break;
        case 'scaleOut':
          from = { scale: 1, alpha: 1 };
          to = { scale: 0.2, alpha: 0 };
          break;
        case 'moveOut': {
          const dir = p.direction || 'up';
          const offset = p.offset ?? 60;
          if (dir === 'up') to = { y: -offset, alpha: 0 };
          else if (dir === 'down') to = { y: offset, alpha: 0 };
          else if (dir === 'left') to = { x: -offset, alpha: 0 };
          else to = { x: offset, alpha: 0 };
          from = { x: 0, y: 0, alpha: 1 };
          break;
        }
        default:
          from = { alpha: 1 };
          to = { alpha: 0 };
          break;
      }
    }

    try { (node as any)?.__elementNode?.resetAnimation?.(); } catch {}
    // 非阻塞：后台播放并在完成后根据需要隐藏
    const promise = this.animator.animate(animTarget, from, to, duration, easing);
    if (hideAfter) {
      promise.then(() => {
        try {
          context.executor?.executeCommand?.({ id: `hide_${id}_${Date.now()}` as any, type: CommandType.SET_ELEMENT_STYLE as any, parameters: { elementId: id, style: { display: 'none' } } } as any);
        } catch {}
      }).catch(() => {});
    }
    return this.createSuccessResult({ elementId: id, preset, duration, easing, hideAfter, nonBlocking: true });
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

  private async resolveTimelineDurationMs(spec: string, override: number | undefined, context: CommandContext): Promise<number> {
    if (override != null && Number(override) >= 0) return Number(override);
    const data = await this.loadAnimationData(spec, context);
    if (!data) return 600;
    const parseMs = (v: any): number => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      const s = String(v).trim();
      if (/^\d+(\.\d+)?s$/i.test(s)) return Math.round(parseFloat(s) * 1000);
      if (/^\d+(\.\d+)?ms$/i.test(s)) return Math.round(parseFloat(s));
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    if (data.duration != null) return parseMs(data.duration);
    const list = Array.isArray(data.timeline) ? data.timeline : [];
    let maxT = 0;
    for (const k of list) {
      const t = parseMs(k?.time);
      if (t > maxT) maxT = t;
    }
    return maxT || 600;
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

export default AnimateOutHandler;
