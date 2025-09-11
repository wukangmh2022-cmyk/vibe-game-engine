import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { Animator } from '../browser/Animator';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class ShowImageHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_IMAGE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const params = command.parameters || {};
    // 兼容 V2：elementId/resourceId/position/size；同时兼容旧版：src/x/y/width/height/id
    const elementId = params.elementId || params.id || `image_${Date.now()}`;
    const resourceId = params.resourceId;
    let src: string | undefined = params.src;
    const pos = params.position || {};
    const size = params.size || {};
    const x = params.x ?? pos.x ?? 0;
    const y = params.y ?? pos.y ?? 0;
    const width = params.width ?? size.width;
    const height = params.height ?? size.height;

    // 若提供了 resourceId 尝试从资源管理器解析 url/src
    if (!src && resourceId && (context as any).resourceManager?.getResource) {
      try {
        const res: any = (context as any).resourceManager.getResource(resourceId);
        if (res) {
          src = res.url || res.src || src;
        }
      } catch {}
    }

    if (!src && !resourceId) {
      return this.createErrorResult('Missing required parameter: src or resourceId');
    }

    try {
      const elementConfig: ElementConfig = {
        id: elementId,
        type: 'image',
        position: { x, y },
        src,
        visible: true
      };

      if (width && height) {
        elementConfig.size = { width, height };
      }

      const element = context.renderManager.createElement(elementConfig);
      // 播放基于资源脚本的入场/循环动画（可选）
      await this.applyAnimationsIfAny(elementId, params, context);
      return this.createSuccessResult({ elementId, src: src || null, resourceId: resourceId || null, position: { x, y } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to show image: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    // 自定义校验在 execute 中处理（src 或 resourceId 二选一）
    return [];
  }

  // ===== 动画接入（与浏览器运行时一致） =====
  private async applyAnimationsIfAny(elementId: string, params: any, context: CommandContext) {
    const anim = params?.animation || {};
    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(elementId) : null;
    if (!node) return;
    const animator = new Animator();

    const playTimeline = async (specIdOrUrl: string) => {
      try {
        const url = await this.resolveAnimationUrl(specIdOrUrl, context);
        if (!url || typeof (globalThis as any).fetch !== 'function') return; // Node 环境跳过
        const startToken = ((node as any).__animToken || 0);
        const res = await fetch(url);
        const data = await res.json();
        const timeline = (data.timeline || []).slice().sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
        const relative = !!data.relative;
        const origin = data.origin;
        if (origin === 'center' && (node as any).anchor) (node as any).anchor.set(0.5);
        if (timeline.length === 0) return;

        const toAbs = (props: any) => this.toAnimatorProps(props);
        const loopBase = { x: (node as any).x || 0, y: (node as any).y || 0, alpha: (node as any).alpha ?? 1, scaleX: (node as any).scale?.x ?? 1, scaleY: (node as any).scale?.y ?? 1 };
        const resolveWithBase = (props: any) => {
          const out = { ...props };
          if (relative) {
            if (out.x != null) out.x = (loopBase.x ?? 0) + out.x;
            if (out.y != null) out.y = (loopBase.y ?? 0) + out.y;
            if (out.scaleX != null) out.scaleX = (loopBase.scaleX ?? 1) + out.scaleX;
            if (out.scaleY != null) out.scaleY = (loopBase.scaleY ?? 1) + out.scaleY;
          }
          return out;
        };

        // 应用第一帧（相对模式下也安全：y:0 => 当前位置），并在每步前检查令牌避免拖拽期突变
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
          await animator.animate(node, from, to, duration, easing as any);
          if (((node as any).__animToken || 0) !== startToken) return;
        }
      } catch (e) {
        // 静默失败，避免影响主流程
      }
    };

    if (anim.entry?.animId) {
      await playTimeline(anim.entry.animId);
    }
    if (anim.loop?.animId) {
      (node as any).__loopAnimId = anim.loop.animId;
      const startLoop = (animId: string) => {
        let stopped = false;
        const run = async () => { while (!stopped) { await playTimeline(animId); } };
        run();
        return () => { stopped = true; };
      };
      if ((node as any).__loopCancel) { try { (node as any).__loopCancel(); } catch {} (node as any).__loopCancel = null; }
      (node as any).__loopCancel = startLoop((node as any).__loopAnimId);
      // 拖拽时暂停，释放时恢复（依赖 Pixi 事件，Node 环境无影响）
      if (!(node as any).__loopPauseHandlers && (node as any).on) {
        const onDown = () => {
          // 取消循环并使任何进行中的补间立即结束
          if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0;
          (node as any).__animToken++;
          if ((node as any).__loopCancel) { try { (node as any).__loopCancel(); } catch {} (node as any).__loopCancel = null; }
        };
        const onUp = () => { if (!(node as any).__loopCancel && (node as any).__loopAnimId) { (node as any).__loopCancel = startLoop((node as any).__loopAnimId); } };
        (node as any).on('pointerdown', onDown);
        (node as any).on('pointerup', onUp);
        (node as any).on('pointerupoutside', onUp);
        (node as any).__loopPauseHandlers = { onDown, onUp };
      }
    }
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
    if (props.scaleX != null || props.scaleY != null) {
      out.scale = { x: props.scaleX ?? 1, y: props.scaleY ?? 1 };
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
