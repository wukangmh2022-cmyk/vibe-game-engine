import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';

declare const PIXI: any;

export class SetSelectableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SELECTABLE as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p: any = command.parameters || {};
    let id: string | undefined = p.elementId;
    const sm: any = (context as any).stateManager;
    if (!id && p.elementIdVar && sm?.getVariable) {
      try { id = sm.getVariable(p.elementIdVar); } catch {}
    }
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = (context as any).renderManager;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const selectable = p.selectable !== false;
    // clear previous
    if (node.__selectHandler) { try { node.off?.('pointertap', node.__selectHandler); } catch {} }
    if (!selectable) {
      node.eventMode = 'auto';
      node.cursor = 'default';
      return this.createSuccessResult({ elementId: id, selectable: false });
    }

    // Enable interactivity (Pixi v7: eventMode; v6: interactive)
    try { (node as any).eventMode = 'static'; } catch {}
    try { (node as any).interactive = true; } catch {}
    node.cursor = 'pointer';

    const overlayResId: string | undefined = p.overlayResourceId || p.selectedResourceId;
    const effect: string | undefined = p.effect; // 'pulse'
    // persist configuration on node for later SetSelectedHandler / reapply
    try { (node as any).__overlayResId = overlayResId; (node as any).__selectEffect = effect; } catch {}
    const variableKey: string | undefined = p.variableKey;

    // overlay sprite holder
    const ensureOverlay = () => {
      if (node.__selectOverlay) return node.__selectOverlay;
      try {
        const P = (globalThis as any).PIXI || PIXI || rm?.getPixi?.();
        const resMgr: any = (context as any).resourceManager;
        const rid = (node as any).__overlayResId || overlayResId;
        let url: string | undefined;
        if (rid) {
          const r = resMgr?.getResource?.(rid);
          url = r?.url || r?.src;
          // If resource manager has no entry and rid looks like a URL/path, use it directly
          if (!url && typeof rid === 'string' && /\.|\//.test(rid)) url = rid;
        }
        if (!P) return null;
        let tex: any = null;
        try { tex = url ? P.Texture.from(url) : null; } catch { tex = null; }
        if (!tex) {
          // fallback simple circle
          const g = new P.Graphics();
          try {
            g.lineStyle?.(3, 0x00ff88, 1);
            g.beginFill(0x00ff88, 0.25);
          } catch {}
          g.drawCircle(0, 0, 20); g.endFill?.();
          tex = (rm?.getApp?.()?.renderer || rm?.app?.renderer)?.generateTexture(g);
          g.destroy();
        }
        const s = new P.Sprite(tex);
        s.anchor?.set?.(0.5);
        // center overlay relative to target node; handle anchor(0.5)
        try {
          const ax = (node.anchor && typeof node.anchor.x === 'number') ? node.anchor.x : 0;
          const ay = (node.anchor && typeof node.anchor.y === 'number') ? node.anchor.y : 0;
          if (Math.abs(ax - 0.5) < 1e-3 && Math.abs(ay - 0.5) < 1e-3) { s.x = 0; s.y = 0; }
          else { s.x = (node.width || 0) / 2; s.y = (node.height || 0) / 2; }
        } catch { s.x = (node.width || 0) / 2; s.y = (node.height || 0) / 2; }
        s.visible = false;
        try { node.sortableChildren = true; s.zIndex = 9999; } catch {}
        try { (s as any).eventMode = 'none'; (s as any).interactive = false; } catch {}
        try {
          // scale overlay to a reasonable size relative to target
          const nw = (node.width || 0), nh = (node.height || 0);
          if (s.width && s.height && nw && nh) {
            const ratio = Math.min(1, Math.min(nw, nh) / (Math.max(s.width, s.height) * 1.8));
            if (ratio > 0 && ratio < 1e3) s.scale?.set?.(ratio);
          }
        } catch {}
        node.addChild?.(s);
        node.__selectOverlay = s;
        return s;
      } catch { return null; }
    };

    const animator: any = new ((require('../browser/Animator').Animator) as any)();
    // play a one-shot timeline animation defined in resources.animations
    const playEffectAnimation = async (animId: string) => {
      try {
        if (!animId) return;
        const rmAny: any = (context as any).resourceManager;
        const res = rmAny?.getResource?.(animId);
        const url: string | undefined = res?.url || res?.src || (typeof animId === 'string' ? animId : undefined);
        if (!url) return;
        // mark a token so interleaved toggles cancel previous anim
        if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0;
        const startToken = ++(node as any).__animToken;
        // fetch with fallback: if base-joined URL 404, try strip base or '/animations' static
        const tryFetch = async (u: string): Promise<any | null> => {
          try {
            const resp = await fetch(u);
            if (resp.ok) return await resp.json();
          } catch {}
          return null;
        };
        let data: any = await tryFetch(url);
        if (!data) {
          try {
            const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
            const base: string = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__ || '';
            if (base && typeof url === 'string' && url.startsWith(base)) {
              const rel = url.slice(base.length).replace(/^\/+/, '');
              // Try static '/animations/...'
              if (rel.startsWith('animations/')) data = await tryFetch('/' + rel);
            }
          } catch {}
        }
        if (!data) return;
        if (!data || !Array.isArray(data.timeline) || data.timeline.length === 0) return;
        const tl = data.timeline.slice().sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
        const relative = !!data.relative;
        const origin = data.origin;
        try { if (origin === 'center' && (node as any).anchor) (node as any).anchor.set(0.5); } catch {}
        const getState = () => ({
          alpha: (node as any).alpha ?? 1,
          x: (node as any).x ?? 0,
          y: (node as any).y ?? 0,
          scale: { x: (node as any).scale?.x ?? 1, y: (node as any).scale?.y ?? 1 }
        });
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
        const base = getState();
        const resolve = (p: any) => {
          const out = { ...p };
          if (relative) {
            if (out.x != null) out.x = (base.x ?? 0) + out.x;
            if (out.y != null) out.y = (base.y ?? 0) + out.y;
            if (out.scale && out.scale.x != null) out.scale.x = (base.scale?.x ?? 1) + out.scale.x;
            if (out.scale && out.scale.y != null) out.scale.y = (base.scale?.y ?? 1) + out.scale.y;
          }
          return out;
        };
        // apply first frame
        if (((node as any).__animToken || 0) !== startToken) return;
        const first = tl[0];
        const from0 = getState();
        const to0 = toProps(resolve(toProps(first.props || {})));
        await animator.animate(node, from0, to0, Math.max(0, (tl[0].time || 0)), (first.ease || 'easeOutQuad'));
        for (let i = 0; i < tl.length - 1; i++) {
          if (((node as any).__animToken || 0) !== startToken) return;
          const cur = tl[i]; const nxt = tl[i + 1];
          const from = getState();
          const to = toProps(resolve(toProps(nxt.props || {})));
          const dur = Math.max(0, (nxt.time || 0) - (cur.time || 0));
          const easing = nxt.ease || 'easeOutQuad';
          await animator.animate(node, from, to, dur, easing as any);
        }
      } catch {}
    };

    const applyVisual = (selected: boolean) => {
      const s = ensureOverlay();
      if (s) s.visible = selected;
      if (effect === 'pulse') {
        try {
          if (selected) { animator.loopPulseScale(node, 0.95, 1.05, 900); }
          else { animator.stop(node); if (node.scale) { node.scale.x = 1; node.scale.y = 1; } }
        } catch {}
      } else if (selected && typeof effect === 'string' && effect.trim().length > 0) {
        try { animator.stop(node); } catch {}
        // play one-shot timeline by animation resource id or URL
        playEffectAnimation(effect).then(() => { /* no-op */ }).catch(() => {});
      }
      if (!selected && node.__selectOverlay) {
        try { node.__selectOverlay.visible = false; } catch {}
      }
    };

    const onTap = () => {
      const next = !(node.__selected === true);
      node.__selected = next;
      try { sm?.setVariable?.('lastChangingSelectStateID', id); } catch {}
      if (variableKey) { try { sm?.setVariable?.(variableKey, next); } catch {} }
      applyVisual(next);
      const exec = (context as any).executor;
      const cmds = next ? (Array.isArray(p.onSelectedCommands) ? p.onSelectedCommands : []) : (Array.isArray(p.onCancelSelectedCommands) ? p.onCancelSelectedCommands : []);
      if (Array.isArray(cmds) && cmds.length) exec.executeCommands(cmds);
    };

    // Initialize visual according to existing state or bound variable
    try {
      const initSel = (typeof (node as any).__selected === 'boolean') ? (node as any).__selected
        : (variableKey ? !!sm?.getVariable?.(variableKey) : false);
      node.__selected = initSel;
      applyVisual(initSel);
    } catch { applyVisual(node.__selected === true); }
    node.on?.('pointertap', onTap);
    node.__selectHandler = onTap;
    return this.createSuccessResult({ elementId: id, selectable: true });
  }
}

export default SetSelectableHandler;
