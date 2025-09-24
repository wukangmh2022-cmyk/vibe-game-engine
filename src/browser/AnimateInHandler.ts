import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from './Animator';
import { Easings } from './anim/Easings';
import { resolveIdFromBraces } from '../utils/ParamResolver';

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
      // 非阻塞播放资源动画时间轴
      this.playTimeline(node, spec, context).catch(() => {});
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

  private async playTimeline(node: any, specIdOrUrl: string, context: CommandContext): Promise<void> {
    try {
      const url = await this.resolveAnimationUrl(specIdOrUrl, context);
      if (!url || typeof (globalThis as any).fetch !== 'function') return;
      const startToken = ((node as any).__animToken || 0);
      const tryFetch = async (u: string): Promise<any | null> => {
        try { const r = await fetch(u); if (r.ok) return await r.json(); } catch {}
        return null;
      };
      let data: any = await tryFetch(url);
      if (!data) {
        try {
          const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
          const base: string = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__ || '';
          if (base && typeof url === 'string' && url.startsWith(base)) {
            const rel = url.slice(base.length).replace(/^\/+/, '');
            if (rel.startsWith('animations/')) {
              data = await tryFetch('/' + rel);
            }
          }
        } catch {}
      }
      if (!data) return;
      const timeline = (data.timeline || []).slice().sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
      const relative = !!data.relative;
      const origin = data.origin;
      // Do not mutate anchor during playback to avoid coordinate drift
      if (timeline.length === 0) return;

      const toAbs = (props: any) => this.toAnimatorProps(props);
      const base = { x: (node as any).x || 0, y: (node as any).y || 0, alpha: (node as any).alpha ?? 1, scaleX: (node as any).scale?.x ?? 1, scaleY: (node as any).scale?.y ?? 1 };
      const resolveWithBase = (props: any) => {
        const out = { ...props };
        // Support shorthand `scale`
        if (out.scale != null && (out.scaleX == null && out.scaleY == null)) {
          const s = out.scale;
          if (typeof s === 'number') { out.scaleX = s; out.scaleY = s; }
          else if (s && typeof s === 'object') { if (s.x != null) out.scaleX = s.x; if (s.y != null) out.scaleY = s.y; }
        }
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
    // Support scaleX/scaleY or shorthand `scale`
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
    if (props.scale && node.scale) {
      node.scale.x = props.scale.x ?? node.scale.x;
      node.scale.y = props.scale.y ?? node.scale.y;
    }
  }

  private getAnimatorState(node: any) {
    const st: any = {};
    if (node.alpha != null) st.alpha = node.alpha;
    if (node.x != null) st.x = node.x;
    if (node.y != null) st.y = node.y;
    if (node.scale) st.scale = { x: node.scale.x ?? 1, y: node.scale.y ?? 1 };
    return st;
  }
}
