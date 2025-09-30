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

    const preset: string = p.preset || 'fade';
    const duration: number = p.duration ?? 800;
    const easing: keyof typeof Easings = p.easing || (preset === 'bounce' ? 'easeOutBounce' : preset === 'back' ? 'easeOutBack' : preset === 'elastic' ? 'easeOutElastic' : 'easeOutQuad');

    let from: any = p.from || {};
    let to: any = p.to || {};
    const useResource = !!(p.animId || p.animationId);
    if (useResource) {
      const spec = p.animId || p.animationId;
      // 非阻塞播放资源动画时间轴（按 ShowImage 的实现对齐：相对/绝对、旋转中心、时长缩放等）
      this.playTimeline(node, spec, context, { overrideDuration: p.duration }).catch(() => {});
      return this.createSuccessResult({ elementId: id, animId: spec, nonBlocking: true });
    } else {
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

      // 非阻塞：启动入场动画后立即返回，不阻塞后续指令
      // 若需要阻塞，请在流程中显式添加 WAIT 指令
      this.animator.animate(node, from, to, duration, easing);
      return this.createSuccessResult({ elementId: id, preset, duration, easing, nonBlocking: true });
    }
  }

  private async playTimeline(node: any, specIdOrUrl: string, context: CommandContext, options?: { startFromCurrent?: boolean; overrideDuration?: number }): Promise<void> {
    try {
      const url = await this.resolveAnimationUrl(specIdOrUrl, context);
      if (!url || typeof (globalThis as any).fetch !== 'function') return; // Node 环境跳过
      const startToken = ((node as any).__animToken || 0);
      const tryFetch = async (u: string): Promise<any | null> => { try { const r = await fetch(u, { cache: 'force-cache' as any }); if (r.ok) return await r.json(); } catch {} return null; };
      let data: any = ANIM_JSON_CACHE.get(url);
      if (!data) { data = await tryFetch(url); if (data) ANIM_JSON_CACHE.set(url, data); }
      if (!data) {
        try {
          const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
          const base: string = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__ || '';
          if (base && typeof url === 'string' && url.startsWith(base)) {
            const rel = url.slice(base.length).replace(/^\/+/, '');
            if (rel.startsWith('animations/')) { data = await tryFetch('/' + rel); if (data) ANIM_JSON_CACHE.set(url, data); }
          }
        } catch {}
      }
      if (!data) return;

      // Build timeline and optionally scale to declared duration (from options or JSON)
      const parseMs = (v: any): number => {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        const s = String(v).trim();
        if (/^\d+(\.\d+)?s$/i.test(s)) return Math.round(parseFloat(s) * 1000);
        if (/^\d+(\.\d+)?ms$/i.test(s)) return Math.round(parseFloat(s));
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };
      let timeline = (data.timeline || []).map((k: any) => ({ ...k, time: parseMs(k?.time) })).sort((a: any, b: any) => parseMs(a.time) - parseMs(b.time));
      try {
        const declaredRaw: any = (options && (options as any).overrideDuration) ?? (data as any).duration ?? (data as any).period ?? (data as any).cycle ?? ((data as any).seconds != null ? Number((data as any).seconds) * 1000 : undefined);
        const declared = parseMs(declaredRaw);
        const lastT = parseMs((timeline[timeline.length - 1]?.time) || 0);
        const angleLastT = (() => { let t = 0; for (const k of timeline) { if (k && k.props && (k.props.angle != null || k.props.rotation != null)) t = parseMs(k.time || 0); } return t; })();
        let scale: number | null = null;
        if (declared > 0) {
          if (angleLastT > 0 && Math.abs(angleLastT - declared) > 1) scale = declared / angleLastT;
          else if (lastT > 0 && Math.abs(lastT - declared) > 1) scale = declared / lastT;
        }
        if (scale && isFinite(scale) && scale > 0) {
          timeline = timeline.map((k: any) => ({ ...k, time: Math.max(0, Math.round(parseMs(k.time || 0) * scale!)) }));
        }
      } catch {}

      // 若动画未声明 relative，则在元素显式设定了大小时默认按相对模式处理
      const sizeLocked = !!(node as any).__sizeLocked;
      const relative = (data.relative != null) ? !!data.relative : sizeLocked;
      const origin = data.origin;
      // Do not mutate anchor during playback to avoid coordinate drift
      if (timeline.length === 0) return;

      // If rotation/angle animation exists, rotate around visual center without shifting position
      try {
        const usesRotation = timeline.some((k: any) => k && k.props && (k.props.angle != null || k.props.rotation != null));
        if (usesRotation && !(node as any).__centerAnchored && (node as any).anchor && (typeof (node as any).anchor.set === 'function')) {
          const ax = Number((node as any).anchor?.x ?? 0);
          const ay = Number((node as any).anchor?.y ?? 0);
          const w = Number((node as any).width || 0);
          const h = Number((node as any).height || 0);
          if (!(w > 0 && h > 0)) return; // wait until size ready
          const posX = Number((node as any).x || 0);
          const posY = Number((node as any).y || 0);
          const centerX = posX + (0.5 - ax) * w;
          const centerY = posY + (0.5 - ay) * h;
          (node as any).anchor.set(0.5, 0.5);
          (node as any).x = centerX; (node as any).y = centerY;
          (node as any).__centerAnchored = true;
        }
      } catch {}

      const toAbs = (props: any) => this.toAnimatorProps(props);
      // baseline snapshots
      const snapshotState = () => ({
        x: (node as any).x || 0,
        y: (node as any).y || 0,
        alpha: (node as any).alpha ?? 1,
        scaleX: (node as any).scale?.x ?? 1,
        scaleY: (node as any).scale?.y ?? 1,
        angle: (node as any).angle != null ? (node as any).angle : (((node as any).rotation ?? 0) * 180 / Math.PI)
      });
      const loopAnchor = snapshotState();
      const lockedAnchor = snapshotState();
      const resolveWithBase = (props: any, _posBase: { x:number; y:number }, _scaleBase: { scaleX:number; scaleY:number }) => {
        const out = { ...props };
        if (out.scale != null && (out.scaleX == null && out.scaleY == null)) {
          const s = out.scale; if (typeof s === 'number') { out.scaleX = s; out.scaleY = s; } else if (s && typeof s === 'object') { if (s.x != null) out.scaleX = s.x; if (s.y != null) out.scaleY = s.y; }
        }
        if (relative) {
          if (out.x != null) out.x = (loopAnchor.x ?? 0) + out.x;
          if (out.y != null) out.y = (loopAnchor.y ?? 0) + out.y;
          if (out.scaleX != null) out.scaleX = (loopAnchor.scaleX ?? 1) * out.scaleX;
          if (out.scaleY != null) out.scaleY = (loopAnchor.scaleY ?? 1) * out.scaleY;
          if (out.angle != null) out.angle = (loopAnchor.angle ?? 0) + out.angle;
          if (out.rotation != null) { const currentRot = ((loopAnchor.angle ?? 0) * Math.PI / 180); out.rotation = currentRot + out.rotation; }
        } else if (sizeLocked) {
          if (out.scaleX != null) out.scaleX = (lockedAnchor.scaleX ?? 1) * out.scaleX;
          if (out.scaleY != null) out.scaleY = (lockedAnchor.scaleY ?? 1) * out.scaleY;
        }
        return out;
      };

      // apply first frame unless startFromCurrent
      if (((node as any).__animToken || 0) !== startToken) return;
      const first = timeline[0];
      const startFromCurrent = !!(options && options.startFromCurrent);
      if (!startFromCurrent) {
        this.applyAnimatorProps(node, toAbs(resolveWithBase(first.props || {}, { x: loopAnchor.x, y: loopAnchor.y }, { scaleX: loopAnchor.scaleX, scaleY: loopAnchor.scaleY })));
      }

      const EPS = 1e-4;
      const almostEq = (a: number | undefined, b: number | undefined) => (a == null || b == null) ? false : Math.abs(a - b) <= EPS;
      for (let i = 0; i < timeline.length - 1; i++) {
        const cur = timeline[i];
        const nxt = timeline[i + 1];
        if (((node as any).__animToken || 0) !== startToken) return;
        const from = this.getAnimatorState(node);
        const to = toAbs(resolveWithBase(nxt.props || {}, { x: from.x ?? 0, y: from.y ?? 0 }, { scaleX: loopAnchor.scaleX, scaleY: loopAnchor.scaleY }));
        const duration = Math.max(0, (nxt.time || 0) - (cur.time || 0));
        const easing = nxt.ease || 'easeOutQuad';
        const hasAnimProp = (('alpha' in to) || ('x' in to) || ('y' in to) || ('rotation' in to) || ('angle' in to) || !!to.scale);
        if (!hasAnimProp) continue;
        const angleNoChange = ('angle' in to) ? almostEq((from as any).angle, (to as any).angle) : true;
        const rotNoChange = ('rotation' in to) ? almostEq((from as any).rotation, (to as any).rotation) : true;
        const noChange = (( !('alpha' in to) || almostEq(from.alpha, to.alpha)) && (!('x' in to) || almostEq(from.x, to.x)) && (!('y' in to) || almostEq(from.y, to.y)) && (!to.scale || (almostEq(from.scale?.x, to.scale?.x) && almostEq(from.scale?.y, to.scale?.y))) && angleNoChange && rotNoChange);
        if (noChange) continue;
        await this.animator.animate(node, from, to, duration, easing as any);
        if (((node as any).__animToken || 0) !== startToken) return;
      }
    } catch {}
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
      const norm = (p: string) => String(p || '').replace(/^\.\//,'').replace(/^\/+/, '');
      const ensureJson = (p: string) => p.endsWith('.json') ? p : (p + '.json');
      const candidates: string[] = [];
      const name = norm(spec);
      if (/\//.test(name)) {
        candidates.push(ensureJson(name.startsWith('animations/') ? name : `animations/${name.replace(/^.*?\//,'')}`));
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

  private toAnimatorProps(props: any): any {
    const out: any = {};
    if (props.alpha != null) out.alpha = props.alpha;
    if (props.x != null) out.x = props.x;
    if (props.y != null) out.y = props.y;
    if (props.rotation != null) out.rotation = props.rotation; // radians
    if (props.angle != null) out.angle = props.angle; // degrees
    if (props.scaleX != null || props.scaleY != null) {
      out.scale = { x: props.scaleX ?? 1, y: props.scaleY ?? 1 };
    } else if (props.scale != null) {
      if (typeof props.scale === 'number') out.scale = { x: props.scale, y: props.scale };
      else if (typeof props.scale === 'object') out.scale = { x: props.scale.x ?? 1, y: props.scale.y ?? 1 };
    }
    return out;
  }

  private applyAnimatorProps(node: any, props: any) {
    if (!props) return;
    if (props.alpha != null) node.alpha = props.alpha;
    if (props.x != null) node.x = props.x;
    if (props.y != null) node.y = props.y;
    if (props.scale && node.scale) { node.scale.x = props.scale.x ?? node.scale.x; node.scale.y = props.scale.y ?? node.scale.y; }
  }

  private getAnimatorState(node: any) {
    const st: any = {};
    if (node.alpha != null) st.alpha = node.alpha;
    if (node.x != null) st.x = node.x;
    if (node.y != null) st.y = node.y;
    if (node.scale) st.scale = { x: node.scale.x ?? 1, y: node.scale.y ?? 1 };
    try { if ((node as any).angle != null) (st as any).angle = (node as any).angle; } catch {}
    try { if ((node as any).rotation != null) (st as any).rotation = (node as any).rotation; } catch {}
    return st;
  }
}
