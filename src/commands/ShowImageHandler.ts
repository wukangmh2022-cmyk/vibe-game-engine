import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
// Cache parsed animation JSON by resolved URL/id to avoid repeated fetch/allocations
const ANIM_JSON_CACHE: Map<string, any> = new Map();
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveIdFromBraces, resolveFromBraces, resolveNumberFromBraces } from '../utils/ParamResolver';

export class ShowImageHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_IMAGE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const params = command.parameters || {};
    // 兼容 V2：elementId/resourceId/position/size；同时兼容旧版：src/x/y/width/height/id
    // Allow elementId/parentId to be provided as {var}
    const resolvedElementId = resolveIdFromBraces(params.elementId, context) || params.elementId || params.id;
    const elementId = resolvedElementId || `image_${Date.now()}`;
    const resourceId = params.resourceId;
    let src: string | undefined = params.src;
    const pos = params.position || {};
    const size = params.size || {};
    // treat provided x/y as offsets; center-align logic will add parent center when needed
    // Resolve x/y from braces variables when provided
    let xRaw: any = params.x ?? pos.x;
    let yRaw: any = params.y ?? pos.y;
    const rx = resolveNumberFromBraces(xRaw, context);
    const ry = resolveNumberFromBraces(yRaw, context);
    let x = (rx != null ? rx : (xRaw != null ? Number(xRaw) : 0));
    let y = (ry != null ? ry : (yRaw != null ? Number(yRaw) : 0));
    if (Number.isNaN(x)) x = 0;
    if (Number.isNaN(y)) y = 0;
    const width = params.width ?? size.width;
    const height = params.height ?? size.height;
    const parentId: string | undefined = resolveIdFromBraces(params.parentId || params.parentElementId, context);
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
        // Update underlying visual's texture when elementId相同但资源变化
        if (src) {
          const P = rm?.getPixi?.();
          const wrapper: any = existing;
          const content: any = (wrapper as any).__content || undefined;
          if (P && content && ('texture' in content)) {
            const newTex = P.Texture.from(src);
            if (content.texture !== newTex) {
              content.texture = newTex;
            }
            // propagate resourceId for downstream tools
            try { (wrapper as any).resourceId = resourceId || (wrapper as any).resourceId; } catch {}
            try { (content as any).resourceId = resourceId || (content as any).resourceId; } catch {}
          }
        }
        // Merge style and allow zIndex update
        const mergedStyle: any = params.style ? { ...params.style } : {};
        if (params.zIndex != null) mergedStyle.zIndex = params.zIndex;
        // 若指定父元素：仅声明中心对齐，偏移交由节点处理（SRP）
        if (parentId) {
          if (mergedStyle.anchorX == null) mergedStyle.anchorX = 0.5;
          if (mergedStyle.anchorY == null) mergedStyle.anchorY = 0.5;
          (mergedStyle as any).alignCenter = true;
          const offXraw = params.x ?? (params.position?.x ?? 0);
          const offYraw = params.y ?? (params.position?.y ?? 0);
          const offX = resolveNumberFromBraces(offXraw, context);
          const offY = resolveNumberFromBraces(offYraw, context);
          x = (offX != null ? offX : Number(offXraw) || 0);
          y = (offY != null ? offY : Number(offYraw) || 0);
        }
        // Apply updates via renderer API
        const updates: Partial<ElementConfig> = {} as any;
        // position: 若挂到父元素，x/y 作为偏移，并声明 alignCenter；否则按传入值更新
        if (parentId) {
          updates.position = { x, y } as any;
          (updates as any).style = { ...(updates as any).style, alignCenter: true, anchorX: 0.5, anchorY: 0.5 } as any;
        } else if (params.position && (params.position.x != null || params.position.y != null)) {
          const px = resolveNumberFromBraces(params.position.x, context);
          const py = resolveNumberFromBraces(params.position.y, context);
          updates.position = { x: (px != null ? px : Number(params.position.x)), y: (py != null ? py : Number(params.position.y)) } as any;
        } else if (params.x != null || params.y != null) {
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
        // 不在外部记录内部属性；对齐信息由节点内部维护
        // Non-blocking animations (entry/loop) still apply if provided
        await this.applyAnimationsIfAny(elementId, params, context);
        return this.createSuccessResult({ elementId, updated: true, position: updates.position || { x: existing.x, y: existing.y } });
      }

      // 单一职责：若指定父元素，则只声明对齐为中心，偏移量仍使用传入的 x/y；真正的对齐偏移由 RenderElementNode 处理
      if (parentId) { (params.style = params.style || {}); (params.style.alignCenter = true); (params.style.anchorX = 0.5); (params.style.anchorY = 0.5); }

      // Merge style and support top-level zIndex for compatibility
      const mergedStyle: any = params.style ? { ...params.style } : {};
      if (params.zIndex != null) {
        mergedStyle.zIndex = params.zIndex;
      }
      // 移除对齐参数后，默认居中（若挂到父元素上）
      if (parentId) { if (mergedStyle.anchorX == null) mergedStyle.anchorX = 0.5; if (mergedStyle.anchorY == null) mergedStyle.anchorY = 0.5; }

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
      // 不再外部记录内部属性；对齐由节点内部维护
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
    const elementNode: any = (node as any).__elementNode;
    if (!elementNode) return;

    const entrySpec: string | undefined = anim?.entry?.animId || anim?.entry?.animationId;
    const loopSpec: string | undefined = anim?.loop?.animId || anim?.loop?.animationId;
    const entryDuration = anim?.entry?.duration ?? anim?.entry?.period ?? anim?.entry?.cycle ?? (anim?.entry?.seconds != null ? Number(anim.entry.seconds) * 1000 : undefined);
    const loopDuration = anim?.loop?.duration ?? anim?.loop?.period ?? anim?.loop?.cycle ?? (anim?.loop?.seconds != null ? Number(anim.loop.seconds) * 1000 : undefined);
    const resolver = (spec: string) => this.loadAnimationData(spec, context);

    try {
      if (entrySpec) {
        await elementNode.setEntryTimeline(entrySpec, { duration: entryDuration, resolver });
      }
      if (loopSpec) {
        await elementNode.setLoopTimeline(loopSpec, { duration: loopDuration, resolver, startAfterEntry: !!entrySpec });
        (node as any).__loopAnimId = loopSpec;
        (node as any).__loopCancel = () => { try { elementNode.clearLoopTimeline(); } catch {} };
        if (!(node as any).__loopPauseHandlers && (node as any).on) {
          const onDown = () => { try { elementNode.clearLoopTimeline(); } catch {} };
          const onUp = () => {
            const aid = (node as any).__loopAnimId;
            if (aid) {
              try { elementNode.setLoopTimeline(aid, { duration: loopDuration, resolver, startAfterEntry: false }); } catch {}
            }
          };
          (node as any).on('pointerdown', onDown);
          (node as any).on('pointerup', onUp);
          (node as any).on('pointerupoutside', onUp);
          (node as any).__loopPauseHandlers = { onDown, onUp };
        }
      }
    } catch {}
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

}
