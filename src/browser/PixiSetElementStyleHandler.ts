import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveIdFromBraces } from '../utils/ParamResolver';

/**
 * Pixi 版 SET_ELEMENT_STYLE
 * 支持最常见的 display/opacity/visibility 等样式更新。
 */
export class PixiSetElementStyleHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_ELEMENT_STYLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    let id: string | undefined = resolveIdFromBraces(p.elementId, context);
    const style = (p.style || {}) as any;
    if (!id || typeof style !== 'object') {
      return this.createErrorResult('Missing required parameter: elementId/style');
    }

    try {
      const rm: any = context.renderManager as any;
      if (rm?.updateElement) {
        // Map CSS-like style to Pixi properties
        const updates: Partial<ElementConfig> = {} as any;
        // display
        if (style.display !== undefined) {
          (updates as any).visible = style.display !== 'none';
        }
        // visibility
        if (style.visibility !== undefined) {
          (updates as any).visible = style.visibility !== 'hidden';
        }
        // opacity
        if (style.opacity !== undefined) {
          const node = rm.getNode ? rm.getNode(id) : null;
          if (node) node.alpha = Number(style.opacity);
        }
        // z-index (layering)
        if (style.zIndex !== undefined) {
          const node = rm.getNode ? rm.getNode(id) : null;
          if (node) {
            try { (node as any).zIndex = Number(style.zIndex); (node as any).parent?.sortChildren?.(); } catch {}
          }
        }
        // 移除通过 style.left/top 设置位置的支持（请改用 MOVE_TO 或专用移动指令）
        // scale (optional): support scale or scaleX/scaleY
        if (style.scale !== undefined || style.scaleX !== undefined || style.scaleY !== undefined) {
          let sx: number | undefined;
          let sy: number | undefined;
          if (style.scale !== undefined) {
            const s = Number(style.scale);
            if (!Number.isNaN(s)) { sx = s; sy = s; }
          }
          if (style.scaleX !== undefined) { const v = Number(style.scaleX); if (!Number.isNaN(v)) sx = v; }
          if (style.scaleY !== undefined) { const v = Number(style.scaleY); if (!Number.isNaN(v)) sy = v; }
          if (sx != null || sy != null) {
            (updates as any).scale = { x: sx ?? 1, y: sy ?? 1 } as any;
          }
        }

        // If it's a regular element, apply via updateElement; otherwise try UI node fallback
        const node0 = rm.getNode ? rm.getNode(id) : null;
        if (node0) {
          // 当存在“居中对齐到父”的标记时，确保在切换 display 时保持居中偏移不变
          try {
            if ((updates as any).visible === true && (node0 as any).__alignCenterParentId && (node0 as any).parent) {
              const pid = (node0 as any).__alignCenterParentId;
              const parentNode = rm.getNode ? rm.getNode(pid) : (node0 as any).parent;
              const offX = (node0 as any).__alignOffsetX || 0;
              const offY = (node0 as any).__alignOffsetY || 0;
              const pax = (parentNode as any)?.anchor?.x != null ? Number((parentNode as any).anchor.x) : 0;
              const pay = (parentNode as any)?.anchor?.y != null ? Number((parentNode as any).anchor.y) : 0;
              const pw = Number((parentNode as any)?.width || 0);
              const ph = Number((parentNode as any)?.height || 0);
              // 确保子元素 anchor 为中心
              try { if ((node0 as any).anchor) (node0 as any).anchor.set(0.5); } catch {}
              // 当父锚点非 0.5 时，需要把子元素移动到父 bounds 中心再加偏移
              if (!(Math.abs(pax - 0.5) < 1e-3 && Math.abs(pay - 0.5) < 1e-3)) {
                (updates as any).position = { x: (pw / 2) + offX, y: (ph / 2) + offY } as any;
              } else {
                (updates as any).position = { x: offX, y: offY } as any;
              }
            }
          } catch {}
          rm.updateElement(id, updates);
        } else {
          // Try UI node registry (choices/text overlays)
          const uiMap: Map<string, any> | undefined = rm.__uiNodes as any;
          const uiNode = uiMap && (uiMap as any).get ? (uiMap as any).get(id) : undefined;
          if (uiNode) {
            try {
              if (updates.visible != null) uiNode.visible = !!(updates as any).visible;
              if ((updates as any).scale) {
                const sc = (updates as any).scale; uiNode.scale && uiNode.scale.set(sc.x ?? 1, sc.y ?? 1);
              }
              if (style.opacity !== undefined) uiNode.alpha = Number(style.opacity);
            } catch {}
          }
        }
        // Also apply to paired background (nine-slice) if exists: `${id}__bg`
        const bgId = `${id}__bg`;
        const bgNode = rm.getNode ? rm.getNode(bgId) : null;
        if (bgNode) {
          const bgUpdates: any = {};
          if (style.display !== undefined) bgUpdates.visible = style.display !== 'none';
          if (style.visibility !== undefined) bgUpdates.visible = style.visibility !== 'hidden';
          if (style.opacity !== undefined) { try { bgNode.alpha = Number(style.opacity); } catch {} }
          if (style.zIndex !== undefined) { try { (bgNode as any).zIndex = Number(style.zIndex); (bgNode as any).parent?.sortChildren?.(); } catch {} }
          if (style.left !== undefined || style.top !== undefined) {
            const bx = style.left !== undefined ? Number(style.left) : undefined;
            const by = style.top !== undefined ? Number(style.top) : undefined;
            bgUpdates.position = { x: bx, y: by };
          }
          rm.updateElement(bgId, bgUpdates);
        }
        return this.createSuccessResult({ elementId: id, style });
      }
      return this.createErrorResult('Renderer does not support updateElement');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.createErrorResult(`Failed to set element style: ${msg}`);
    }
  }

  protected getRequiredParameters(): string[] { return ['elementId', 'style']; }
}
