import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { Animator } from '../browser/Animator';

// Cache parsed animation JSON by resolved URL/id to avoid repeated fetch/allocations
const ANIM_JSON_CACHE: Map<string, any> = new Map();
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
    // treat provided x/y as offsets; center-align logic will add parent center when needed
    let x = params.x ?? pos.x ?? 0;
    let y = params.y ?? pos.y ?? 0;
    const width = params.width ?? size.width;
    const height = params.height ?? size.height;
    const parentId: string | undefined = params.parentId || params.parentElementId;
    const align: string | undefined = params.align || params.alignment;

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
      const rm: any = context.renderManager as any;
      const existing = rm?.getNode ? rm.getNode(elementId) : null;
      // If element with same id exists → treat as update instead of creating a new one
      if (existing) {
        // Resolve src by resourceId if needed
        if (!src && resourceId && (context as any).resourceManager?.getResource) {
          try {
            const res: any = (context as any).resourceManager.getResource(resourceId);
            if (res) src = res.url || res.src || src;
          } catch {}
        }
        // Update texture if sprite-like and new src provided
        try {
          if (src) {
            const P = rm?.getPixi?.();
            if (P) {
              const oldTex: any = (existing as any).texture;
              const newTex = P.Texture.from(src);
              (existing as any).texture = newTex;
              // Proactively destroy previous texture to release GPU/VRAM
              try { oldTex?.destroy?.(true); } catch {}
            }
          }
        } catch {}
        // Merge style and allow zIndex update
        const mergedStyle: any = params.style ? { ...params.style } : {};
        if (params.zIndex != null) mergedStyle.zIndex = params.zIndex;
        // Apply updates via renderer API
        const updates: Partial<ElementConfig> = {} as any;
        // position (only when provided)
        if (params.position && (params.position.x != null || params.position.y != null)) {
          updates.position = { x: params.position.x, y: params.position.y } as any;
        } else if (params.x != null || params.y != null) {
          updates.position = { x, y } as any;
        }
        // size
        if (width != null || height != null) {
          updates.size = { width, height } as any;
        }
        // visibility
        if (params.visible != null) (updates as any).visible = !!params.visible;
        if (Object.keys(mergedStyle).length) (updates as any).style = mergedStyle;
        rm.updateElement?.(elementId, updates);
        // Non-blocking animations (entry/loop) still apply if provided
        await this.applyAnimationsIfAny(elementId, params, context);
        return this.createSuccessResult({ elementId, updated: true, position: updates.position || { x: existing.x, y: existing.y } });
      }

      // If align center with parent specified:
      // - force child anchor to 0.5 for true center positioning
      // - if parent anchor is 0.5, child's (0,0) already at parent center → use offsets directly
      // - otherwise, move to (parent.width/2, parent.height/2) and then apply offsets
      if (parentId && align === 'center') {
        try {
          const parentNode: any = (context.renderManager as any)?.getNode?.(parentId);
          if (parentNode) {
            const pw = Number(parentNode.width || 0); const ph = Number(parentNode.height || 0);
            const pax = (parentNode.anchor && typeof parentNode.anchor.x === 'number') ? Number(parentNode.anchor.x) : 0;
            const pay = (parentNode.anchor && typeof parentNode.anchor.y === 'number') ? Number(parentNode.anchor.y) : 0;
            (params.style = params.style || {});
            (params.style.anchorX = 0.5); (params.style.anchorY = 0.5);
            if (Math.abs(pax - 0.5) < 1e-3 && Math.abs(pay - 0.5) < 1e-3) {
              // parent local origin already at its visual center
              x = x; y = y;
            } else {
              // move to center of parent's bounds (top-left origin)
              x = (pw / 2) + x; y = (ph / 2) + y;
            }
          }
        } catch {}
      }

      // Merge style and support top-level zIndex for compatibility
      const mergedStyle: any = params.style ? { ...params.style } : {};
      if (params.zIndex != null) {
        mergedStyle.zIndex = params.zIndex;
      }
      if (align === 'center') {
        if (mergedStyle.anchorX == null) mergedStyle.anchorX = 0.5;
        if (mergedStyle.anchorY == null) mergedStyle.anchorY = 0.5;
      }

      const visibleParam = (params.hidden === true) ? false : (params.visible != null ? !!params.visible : true);
      const elementConfig: ElementConfig = {
        id: elementId,
        type: 'image',
        position: { x, y },
        src,
        visible: visibleParam,
        parentId,
        style: Object.keys(mergedStyle).length ? mergedStyle : undefined
      };
      // Preserve resourceId for downstream handlers (e.g., CHECK_IN_AREA)
      (elementConfig as any).resourceId = resourceId || undefined;

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
        const timeline = (data.timeline || []).slice().sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
        // 若动画未声明 relative，则在元素显式设定了大小时默认按相对模式处理，避免将 scale 置为绝对 1 破坏图片自定义尺寸
        const sizeLocked = !!(node as any).__sizeLocked;
        const relative = (data.relative != null) ? !!data.relative : sizeLocked;
        const origin = data.origin;
        // Do not mutate anchor during playback to avoid coordinate drift
        if (timeline.length === 0) return;

        const toAbs = (props: any) => this.toAnimatorProps(props);
        // 基线：用于相对值的参考；
        // 位置使用“当前帧 from 状态”为基线（允许与 MOVE_TO 叠加）；
        // 缩放使用“播放开始时的锚点缩放”作为基线（避免每帧相对而累计漂移）。
        const snapshotState = () => ({ x: (node as any).x || 0, y: (node as any).y || 0, alpha: (node as any).alpha ?? 1, scaleX: (node as any).scale?.x ?? 1, scaleY: (node as any).scale?.y ?? 1 });
        const loopAnchor = snapshotState();
        const lockedAnchor = snapshotState(); // 当 sizeLocked 且 relative=false 时，以显示尺寸为锚点
        const resolveWithBase = (props: any, _posBase: { x:number; y:number }, scaleBase: { scaleX:number; scaleY:number }) => {
          const out = { ...props };
          // Support shorthand `scale`
          if (out.scale != null && (out.scaleX == null && out.scaleY == null)) {
            const s = out.scale;
            if (typeof s === 'number') { out.scaleX = s; out.scaleY = s; }
            else if (s && typeof s === 'object') { if (s.x != null) out.scaleX = s.x; if (s.y != null) out.scaleY = s.y; }
          }
          if (relative) {
            // 位置：基于“播放开始锚点”增量（0 表示回到锚点），避免在 0 → … → 0 的时间轴中产生停滞
            if (out.x != null) out.x = (loopAnchor.x ?? 0) + out.x;
            if (out.y != null) out.y = (loopAnchor.y ?? 0) + out.y;
            // 缩放：以“播放开始锚点”作为基线的乘法相对，避免帧间累计漂移
            if (out.scaleX != null) out.scaleX = (loopAnchor.scaleX ?? 1) * out.scaleX;
            if (out.scaleY != null) out.scaleY = (loopAnchor.scaleY ?? 1) * out.scaleY;
          } else if (sizeLocked) {
            // 绝对模式 + 锁尺寸：将时间轴缩放视为“基于显示尺寸”的倍率（固定锚点）
            if (out.scaleX != null) out.scaleX = (lockedAnchor.scaleX ?? 1) * out.scaleX;
            if (out.scaleY != null) out.scaleY = (lockedAnchor.scaleY ?? 1) * out.scaleY;
          }
          return out;
        };

        // 应用第一帧（相对模式下也安全：y:0 => 当前位置），并在每步前检查令牌避免拖拽期突变
        if (((node as any).__animToken || 0) !== startToken) return;
        const first = timeline[0];
        this.applyAnimatorProps(node, toAbs(resolveWithBase(first.props || {}, { x: loopAnchor.x, y: loopAnchor.y }, { scaleX: loopAnchor.scaleX, scaleY: loopAnchor.scaleY })));
        
        for (let i = 0; i < timeline.length - 1; i++) {
          const cur = timeline[i];
          const nxt = timeline[i + 1];
          if (((node as any).__animToken || 0) !== startToken) return;
          const from = this.getAnimatorState(node);
          const to = toAbs(resolveWithBase(nxt.props || {}, { x: from.x ?? 0, y: from.y ?? 0 }, { scaleX: loopAnchor.scaleX, scaleY: loopAnchor.scaleY }));
          const duration = Math.max(0, (nxt.time || 0) - (cur.time || 0));
          const easing = nxt.ease || 'easeOutQuad';
          await animator.animate(node, from, to, duration, easing as any);
          if (((node as any).__animToken || 0) !== startToken) return;
        }
      } catch (e) {
        // 静默失败，避免影响主流程
      }
    };

    // 非阻塞：入场动画不再 await，让后续指令继续执行
    const hasEntry = !!anim.entry?.animId;
    const hasLoop = !!anim.loop?.animId;

    // helper: start loop (reused for immediate or after entry finishes)
    const startLoop = (animId: string) => {
      let stopped = false;
      const run = async () => {
        // Prevent tight loop if node already destroyed or token invalidated
        while (!stopped) {
          try { if (!(node as any) || (node as any).destroyed) break; } catch { break; }
          await playTimeline(animId);
          // If during timeline node got killed or token changed, break
          try { if (!(node as any) || (node as any).destroyed) break; } catch { break; }
        }
      };
      run();
      return () => { stopped = true; };
    };

    if (hasEntry) {
      const entryId = anim.entry.animId;
      // 播放入场动画但不阻塞处理流程
      const entryPromise = playTimeline(entryId);
      // 如存在循环动画：确保循环在入场结束后再开始，避免相互打架
      if (hasLoop) {
        entryPromise.then(() => {
          try {
            (node as any).__loopAnimId = anim.loop.animId;
            if ((node as any).__loopCancel) { try { (node as any).__loopCancel(); } catch {} (node as any).__loopCancel = null; }
            (node as any).__loopCancel = startLoop((node as any).__loopAnimId);
          } catch {}
        });
      }
    } else if (hasLoop) {
      (node as any).__loopAnimId = anim.loop.animId;
      if ((node as any).__loopCancel) { try { (node as any).__loopCancel(); } catch {} (node as any).__loopCancel = null; }
      (node as any).__loopCancel = startLoop((node as any).__loopAnimId);
    }

    // 拖拽时暂停循环动画，释放时恢复（依赖 Pixi 事件，Node 环境无影响）
    if (hasLoop && !(node as any).__loopPauseHandlers && (node as any).on) {
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
        // Try common locations
        candidates.push(ensureJson(`animations/${name}`));
        candidates.push(ensureJson(`animations/基础效果/${name}`));
      }
      for (const rel0 of candidates) {
        const rel = norm(rel0);
        if (typeof getVfsUrl === 'function') {
          const u = await getVfsUrl(rel);
          if (u) return u;
        }
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
