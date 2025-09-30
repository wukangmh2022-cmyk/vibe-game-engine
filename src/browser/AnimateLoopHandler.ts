import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';

// Cache for animation JSON
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
    // stop previous custom loop if any
    try { if ((node as any).__loopCancel) { (node as any).__loopCancel(); (node as any).__loopCancel = null; } } catch {}
    const animId: string | undefined = p.animId || p.animationId;
    if (animId) {
      // resource-based timeline looping (aligned to ShowImage implementation)
      const runLoop = async () => {
        let stopped = false;
        const cancel = () => { stopped = true; };
        (node as any).__loopCancel = cancel; (node as any).__loopAnimId = animId;
        while (!stopped) {
          try {
            await playOnceTimeline(node, animId, context, this.animator, { startFromCurrent: true, overrideDuration: p.duration ?? p.period ?? p.cycle ?? (p.seconds != null ? Number(p.seconds) * 1000 : undefined) });
            // after each cycle, continue unless cancelled/destroyed
            try { if (!(node as any) || (node as any).destroyed) break; } catch { break; }
          } catch {}
        }
      };
      runLoop();
      // 拖拽时暂停循环动画，释放时恢复
      if (!(node as any).__loopPauseHandlers && (node as any).on) {
        const onDown = () => {
          if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0;
          (node as any).__animToken++;
          if ((node as any).__loopCancel) { try { (node as any).__loopCancel(); } catch {} (node as any).__loopCancel = null; }
        };
        const onUp = () => { if (!(node as any).__loopCancel && (node as any).__loopAnimId) {
          const aid = (node as any).__loopAnimId; const rp = async () => { let stopped=false; (node as any).__loopCancel = ()=>{stopped=true;}; while(!stopped){ await playOnceTimeline(node, aid, context, this.animator, { startFromCurrent: true, overrideDuration: p.duration ?? p.period ?? p.cycle ?? (p.seconds != null ? Number(p.seconds) * 1000 : undefined) }); if ((node as any).destroyed) break; } }; rp(); } };
        (node as any).on('pointerdown', onDown);
        (node as any).on('pointerup', onUp);
        (node as any).on('pointerupoutside', onUp);
        (node as any).__loopPauseHandlers = { onDown, onUp };
      }
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

// Helpers aligned with ShowImage implementation
async function resolveAnimationUrl(spec: string, context: CommandContext): Promise<string | null> {
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

function toAnimatorProps(props: any): any {
  const out: any = {};
  if (props.alpha != null) out.alpha = props.alpha;
  if (props.x != null) out.x = props.x;
  if (props.y != null) out.y = props.y;
  if (props.rotation != null) out.rotation = props.rotation;
  if (props.angle != null) out.angle = props.angle;
  if (props.scaleX != null || props.scaleY != null) {
    out.scale = { x: props.scaleX ?? 1, y: props.scaleY ?? 1 };
  } else if (props.scale != null) {
    if (typeof props.scale === 'number') out.scale = { x: props.scale, y: props.scale };
    else if (typeof props.scale === 'object') out.scale = { x: props.scale.x ?? 1, y: props.scale.y ?? 1 };
  }
  return out;
}

function applyAnimatorProps(node: any, props: any) {
  if (!props) return;
  if (props.alpha != null) node.alpha = props.alpha;
  if (props.x != null) node.x = props.x;
  if (props.y != null) node.y = props.y;
  if (props.scale && node.scale) { node.scale.x = props.scale.x ?? node.scale.x; node.scale.y = props.scale.y ?? node.scale.y; }
}

function getAnimatorState(node: any) {
  const st: any = {};
  if (node.alpha != null) st.alpha = node.alpha;
  if (node.x != null) st.x = node.x;
  if (node.y != null) st.y = node.y;
  if (node.scale) st.scale = { x: node.scale.x ?? 1, y: node.scale.y ?? 1 };
  try { if ((node as any).angle != null) (st as any).angle = (node as any).angle; } catch {}
  try { if ((node as any).rotation != null) (st as any).rotation = (node as any).rotation; } catch {}
  return st;
}

async function playOnceTimeline(node: any, specIdOrUrl: string, context: CommandContext, animator: Animator, options?: { startFromCurrent?: boolean; overrideDuration?: number }) {
  const url = await resolveAnimationUrl(specIdOrUrl, context);
  if (!url || typeof (globalThis as any).fetch !== 'function') return;
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

  const parseMs = (v: any): number => { if (v == null) return 0; if (typeof v === 'number') return v; const s = String(v).trim(); if (/^\d+(\.\d+)?s$/i.test(s)) return Math.round(parseFloat(s) * 1000); if (/^\d+(\.\d+)?ms$/i.test(s)) return Math.round(parseFloat(s)); const n = Number(s); return Number.isFinite(n) ? n : 0; };
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
    if (scale && isFinite(scale) && scale > 0) timeline = timeline.map((k: any) => ({ ...k, time: Math.max(0, Math.round(parseMs(k.time || 0) * scale!)) }));
  } catch {}

  const sizeLocked = !!(node as any).__sizeLocked;
  const relative = (data.relative != null) ? !!data.relative : sizeLocked;
  if (timeline.length === 0) return;

  try {
    const usesRotation = timeline.some((k: any) => k && k.props && (k.props.angle != null || k.props.rotation != null));
    if (usesRotation && !(node as any).__centerAnchored && (node as any).anchor && (typeof (node as any).anchor.set === 'function')) {
      const ax = Number((node as any).anchor?.x ?? 0); const ay = Number((node as any).anchor?.y ?? 0);
      const w = Number((node as any).width || 0); const h = Number((node as any).height || 0);
      if (!(w > 0 && h > 0)) return;
      const posX = Number((node as any).x || 0); const posY = Number((node as any).y || 0);
      const centerX = posX + (0.5 - ax) * w; const centerY = posY + (0.5 - ay) * h;
      (node as any).anchor.set(0.5, 0.5); (node as any).x = centerX; (node as any).y = centerY; (node as any).__centerAnchored = true;
    }
  } catch {}

  const loopAnchor = { x: (node as any).x || 0, y: (node as any).y || 0, alpha: (node as any).alpha ?? 1, scaleX: (node as any).scale?.x ?? 1, scaleY: (node as any).scale?.y ?? 1, angle: (node as any).angle != null ? (node as any).angle : (((node as any).rotation ?? 0) * 180 / Math.PI) };
  const lockedAnchor = { ...loopAnchor };
  const toAbs = (props: any) => toAnimatorProps(props);
  const resolveWithBase = (props: any) => {
    const out = { ...props } as any;
    if (out.scale != null && (out.scaleX == null && out.scaleY == null)) { const s = out.scale; if (typeof s === 'number') { out.scaleX = s; out.scaleY = s; } else if (s && typeof s === 'object') { if (s.x != null) out.scaleX = s.x; if (s.y != null) out.scaleY = s.y; } }
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
  if (((node as any).__animToken || 0) !== startToken) return;
  const first = timeline[0];
  applyAnimatorProps(node, toAbs(resolveWithBase(first.props || {})));
  for (let i=0;i<timeline.length-1;i++) {
    const cur = timeline[i]; const nxt = timeline[i+1];
    if (((node as any).__animToken || 0) !== startToken) return;
    const from = getAnimatorState(node);
    const to = toAbs(resolveWithBase(nxt.props || {}));
    const dur = Math.max(0, (nxt.time||0)-(cur.time||0));
    await animator.animate(node, from, to, dur, (nxt.ease||'easeOutQuad') as any);
    if (((node as any).__animToken || 0) !== startToken) return;
  }
}
