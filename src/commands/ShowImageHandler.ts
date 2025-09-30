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
              // If it's the same cached Texture instance, skip reassigning/destroying
              if (oldTex !== newTex) {
                (existing as any).texture = newTex;
              }
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
        } else if (params.x != null || params.y != null || (parentId && align === 'center')) {
          updates.position = { x, y } as any;
        }
        // size (ignore 0/negatives)
        const wEff = (width != null && Number(width) > 0) ? Number(width) : undefined;
        const hEff = (height != null && Number(height) > 0) ? Number(height) : undefined;
        if (wEff != null || hEff != null) updates.size = { width: wEff as any, height: hEff as any } as any;
        // visibility: 默认让 SHOW_IMAGE 让元素可见（若未显式传 false）
        (updates as any).visible = (params.visible != null) ? !!params.visible : true;
        // 恢复 scale/alpha（若之前被用于隐藏）
        const hasScaleFromStyle = mergedStyle && (mergedStyle.scale != null || mergedStyle.scaleX != null || mergedStyle.scaleY != null);
        if ((updates as any).visible === true && !hasScaleFromStyle) {
          try {
            const sx = (existing as any).scale?.x; const sy = (existing as any).scale?.y;
            if (typeof sx === 'number' && typeof sy === 'number' && (Math.abs(sx) < 1e-3 || Math.abs(sy) < 1e-3)) {
              (updates as any).scale = { x: 1, y: 1 } as any;
            }
            const a = (existing as any).alpha;
            if (typeof a === 'number' && a <= 1e-3 && (mergedStyle == null || (mergedStyle as any).opacity == null)) {
              (existing as any).alpha = 1;
            }
          } catch {}
        }
        if (Object.keys(mergedStyle).length) (updates as any).style = mergedStyle;
        // Apply updates; if renderer throws (rare), fallback to safe recreate
        try {
          rm.updateElement?.(elementId, updates);
        } catch (e) {
          try {
            context.logger?.warn?.('updateElement failed, fallback to recreate', { elementId, updates, error: (e as any)?.message || String(e) });
          } catch {}
          try { rm.removeElement?.(elementId); } catch {}
          const visibleParam2 = (params.hidden === true) ? false : (params.visible != null ? !!params.visible : true);
          const recreate: ElementConfig = {
            id: elementId,
            type: 'image',
            position: { x, y },
            src,
            visible: visibleParam2,
            parentId,
            style: Object.keys(mergedStyle).length ? mergedStyle : undefined
          };
          if (width && height && Number(width) > 0 && Number(height) > 0) recreate.size = { width, height } as any;
          try { context.renderManager.createElement(recreate); } catch {}
        }
        // 记录对齐信息：若 align=center 且指定了 parentId，保存偏移用于后续显示/隐藏切换时保持居中
        try {
          if (parentId && align === 'center') {
            const node2 = rm?.getNode ? rm.getNode(elementId) : null;
            if (node2) {
              (node2 as any).__alignCenterParentId = parentId;
              (node2 as any).__alignOffsetX = (params.x ?? (params.position?.x ?? 0)) || 0;
              (node2 as any).__alignOffsetY = (params.y ?? (params.position?.y ?? 0)) || 0;
            }
          }
        } catch {}
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
      // 记录对齐信息（用于后续显示/隐藏切换时维持居中偏移）
      try {
        if (parentId && align === 'center') {
          const node0 = (context.renderManager as any)?.getNode?.(elementId);
          if (node0) {
            (node0 as any).__alignCenterParentId = parentId;
            (node0 as any).__alignOffsetX = (params.x ?? (params.position?.x ?? 0)) || 0;
            (node0 as any).__alignOffsetY = (params.y ?? (params.position?.y ?? 0)) || 0;
          }
        }
      } catch {}
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

    const playTimeline = async (specIdOrUrl: string, options?: { startFromCurrent?: boolean; overrideDuration?: number }) => {
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
          const angleLastT = (() => {
            let t = 0; for (const k of timeline) { if (k && k.props && (k.props.angle != null || k.props.rotation != null)) t = parseMs(k.time || 0); }
            return t;
          })();
          let scale: number | null = null;
          if (declared > 0) {
            if (angleLastT > 0 && Math.abs(angleLastT - declared) > 1) scale = declared / angleLastT;
            else if (lastT > 0 && Math.abs(lastT - declared) > 1) scale = declared / lastT;
          }
          if (scale && isFinite(scale) && scale > 0) {
            timeline = timeline.map((k: any) => ({ ...k, time: Math.max(0, Math.round(parseMs(k.time || 0) * scale!)) }));
          }
        } catch {}
        // 若动画未声明 relative，则在元素显式设定了大小时默认按相对模式处理，避免将 scale 置为绝对 1 破坏图片自定义尺寸
        const sizeLocked = !!(node as any).__sizeLocked;
        const relative = (data.relative != null) ? !!data.relative : sizeLocked;
        const origin = data.origin;
        // Do not mutate anchor during playback to avoid coordinate drift
        if (timeline.length === 0) return;

        // If rotation or angle animation exists, rotate around visual center without shifting position
        try {
          const usesRotation = timeline.some((k: any) => k && k.props && (k.props.angle != null || k.props.rotation != null));
          if (usesRotation && !(node as any).__centerAnchored && (node as any).anchor && (typeof (node as any).anchor.set === 'function')) {
            const ax = Number((node as any).anchor?.x ?? 0);
            const ay = Number((node as any).anchor?.y ?? 0);
            // Compute current visual center from old anchor and size
            const w = Number((node as any).width || 0);
            const h = Number((node as any).height || 0);
            if (!(w > 0 && h > 0)) { /* wait until size ready; try in next iteration */ return; }
            const posX = Number((node as any).x || 0);
            const posY = Number((node as any).y || 0);
            const centerX = posX + (0.5 - ax) * w;
            const centerY = posY + (0.5 - ay) * h;
            // Set anchor to center and keep center fixed
            (node as any).anchor.set(0.5, 0.5);
            (node as any).x = centerX; (node as any).y = centerY;
            (node as any).__centerAnchored = true;
          }
        } catch {}

        const toAbs = (props: any) => this.toAnimatorProps(props);
        // 基线：用于相对值的参考；
        // 位置使用“当前帧 from 状态”为基线（允许与 MOVE_TO 叠加）；
        // 缩放使用“播放开始时的锚点缩放”作为基线（避免每帧相对而累计漂移）。
        const snapshotState = () => ({
          x: (node as any).x || 0,
          y: (node as any).y || 0,
          alpha: (node as any).alpha ?? 1,
          scaleX: (node as any).scale?.x ?? 1,
          scaleY: (node as any).scale?.y ?? 1,
          angle: (node as any).angle != null ? (node as any).angle : (((node as any).rotation ?? 0) * 180 / Math.PI)
        });
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
            // 角度：相对增量（度）
            if (out.angle != null) out.angle = (loopAnchor.angle ?? 0) + out.angle;
            if (out.rotation != null) {
              // rotation 通常表示弧度；若使用相对，直接在当前 rotation 上累加
              const currentRot = ((loopAnchor.angle ?? 0) * Math.PI / 180);
              out.rotation = currentRot + out.rotation;
            }
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
          // Skip no-op segments: either no animatable props, or target equals current values
          const hasAnimProp = (
            ('alpha' in to) || ('x' in to) || ('y' in to) || ('rotation' in to) || ('angle' in to) || !!to.scale
          );
          const looping = !!(options && options.startFromCurrent);
          if (!hasAnimProp) { continue; }
          const angleNoChange = ('angle' in to) ? almostEq((from as any).angle, (to as any).angle) : true;
          const rotNoChange = ('rotation' in to) ? almostEq((from as any).rotation, (to as any).rotation) : true;
          const noChange = (
            (!('alpha' in to) || almostEq(from.alpha, to.alpha)) &&
            (!('x' in to) || almostEq(from.x, to.x)) &&
            (!('y' in to) || almostEq(from.y, to.y)) &&
            (!to.scale || (almostEq(from.scale?.x, to.scale?.x) && almostEq(from.scale?.y, to.scale?.y))) &&
            angleNoChange && rotNoChange
          );
          if (noChange) { continue; }
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
          await playTimeline(animId, { startFromCurrent: true, overrideDuration: (anim.loop && (anim.loop.duration || anim.loop.period || anim.loop.cycle || (anim.loop.seconds != null ? Number(anim.loop.seconds) * 1000 : undefined))) as any });
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
      const entryPromise = playTimeline(entryId, { overrideDuration: (anim.entry && (anim.entry.duration || anim.entry.period || anim.entry.cycle || (anim.entry.seconds != null ? Number(anim.entry.seconds) * 1000 : undefined))) as any });
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
    // rotation / angle
    if (props.rotation != null) out.rotation = props.rotation; // radians
    if (props.angle != null) out.angle = props.angle; // degrees
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
    // include both representations for rotation to help no-op detection
    try { if ((node as any).angle != null) (st as any).angle = (node as any).angle; } catch {}
    try { if ((node as any).rotation != null) (st as any).rotation = (node as any).rotation; } catch {}
    return st;
  }
}
