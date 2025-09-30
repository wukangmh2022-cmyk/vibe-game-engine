import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
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
