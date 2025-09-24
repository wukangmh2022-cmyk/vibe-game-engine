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

    const selected = !!p.selected;
    // 记录最近变更选中状态的元素ID，便于后续指令或事件引用
    try { (context as any).stateManager?.setVariable?.('lastChangingSelectStateID', id); } catch {}
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
      if (eff === 'pulse') {
        this.animator.loopPulseScale(node, 0.95, 1.05, 900);
      } else if (typeof eff === 'string' && eff.trim()) {
        // 播放资源动画时间轴（非阻塞，一次性）
        this.playTimeline(node, eff.trim(), context).catch(() => {});
      }
    } else {
      try { this.animator.stop(node); } catch {}
      if ((node as any).scale) { (node as any).scale.x = 1; (node as any).scale.y = 1; }
    }
    return this.createSuccessResult({ elementId: id, selected });
  }

  private async playTimeline(node: any, specIdOrUrl: string, context: CommandContext): Promise<void> {
    try {
      const url = await this.resolveAnimationUrl(specIdOrUrl, context);
      if (!url || typeof (globalThis as any).fetch !== 'function') return;
      const startToken = ((node as any).__animToken || 0);
      const res = await fetch(url);
      const data = await res.json();
      const timeline = (data.timeline || []).slice().sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
      const relative = !!data.relative;
      const origin = data.origin;
      if (origin === 'center' && (node as any).anchor) (node as any).anchor.set(0.5);
      if (timeline.length === 0) return;

      const toAbs = (props: any) => this.toAnimatorProps(props);
      const base = { x: (node as any).x || 0, y: (node as any).y || 0, alpha: (node as any).alpha ?? 1, scaleX: (node as any).scale?.x ?? 1, scaleY: (node as any).scale?.y ?? 1 };
      const resolveWithBase = (props: any) => {
        const out = { ...props };
        if (relative) {
          if (out.x != null) out.x = (base.x ?? 0) + out.x;
          if (out.y != null) out.y = (base.y ?? 0) + out.y;
          if (out.scaleX != null) out.scaleX = (base.scaleX ?? 1) + out.scaleX;
          if (out.scaleY != null) out.scaleY = (base.scaleY ?? 1) + out.scaleY;
        }
        return out;
      };

      if (((node as any).__animToken || 0) !== startToken) return;
      const first = timeline[0];
      this.applyAnimatorProps(node, toAbs(resolveWithBase(first.props || {})));

      for (let i = 0; i < timeline.length - 1; i++) {
        const cur = timeline[i];
        const nxt = timeline[i + 1];
        if (((node as any).__animToken || 0) !== startToken) return;
        const from = this.getAnimatorState(node);
        const to = toAbs(resolveWithBase(nxt.props || {}));
        const duration = Math.max(0, (nxt.time || 0) - (cur.time || 0));
        const easing = nxt.ease || 'easeOutQuad';
        await this.animator.animate(node, from, to, duration, easing as any);
        if (((node as any).__animToken || 0) !== startToken) return;
      }
    } catch {}
  }

  private async resolveAnimationUrl(spec: string, context: CommandContext): Promise<string | null> {
    if (!spec) return null;
    const rm: any = (context as any).resourceManager;
    const res = rm?.getResource ? rm.getResource(spec) : null;
    return res?.url || (typeof spec === 'string' ? spec : null);
  }

  private toAnimatorProps(props: any): any {
    const out: any = {};
    if (props.alpha != null) out.alpha = props.alpha;
    if (props.x != null) out.x = props.x;
    if (props.y != null) out.y = props.y;
    if (props.angle != null) out.angle = props.angle;
    if (props.rotation != null) out.rotation = props.rotation;
    if (props.scaleX != null || props.scaleY != null) {
      out.scale = { x: props.scaleX ?? 1, y: props.scaleY ?? 1 };
    }
    return out;
  }

  private applyAnimatorProps(node: any, props: any) {
    if (!props) return;
    if (props.alpha != null) (node as any).alpha = props.alpha;
    if (props.x != null) (node as any).x = props.x;
    if (props.y != null) (node as any).y = props.y;
    if (props.angle != null) { try { (node as any).angle = props.angle; } catch {} }
    if (props.rotation != null) { try { (node as any).rotation = props.rotation; } catch {} }
    if (props.scale && (node as any).scale) {
      (node as any).scale.x = props.scale.x ?? (node as any).scale.x;
      (node as any).scale.y = props.scale.y ?? (node as any).scale.y;
    }
  }

  private getAnimatorState(node: any) {
    const st: any = {};
    if ((node as any).alpha != null) st.alpha = (node as any).alpha;
    if ((node as any).x != null) st.x = (node as any).x;
    if ((node as any).y != null) st.y = (node as any).y;
    try { if ((node as any).angle != null) st.angle = (node as any).angle; else if ((node as any).rotation != null) st.rotation = (node as any).rotation; } catch {}
    if ((node as any).scale) st.scale = { x: (node as any).scale.x ?? 1, y: (node as any).scale.y ?? 1 };
    return st;
  }
}
