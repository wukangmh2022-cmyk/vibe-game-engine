import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示文本指令处理器
 */
export class ShowTextHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_TEXT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const text: string = typeof p.text === 'string' ? this.interpolate(p.text, context) : p.text;
    // 兼容V2：position.{x,y} 与 elementId
    const pos = p.position || {};
    const x: number = p.x ?? pos.x ?? 0;
    const y: number = p.y ?? pos.y ?? 0;
    // 安全清洗样式，避免 PIXI 颜色转换 undefined 报错
    const style: any = { ...(p.style || {}) };
    try {
      // 去掉 null/undefined 值
      Object.keys(style).forEach(k => { if (style[k] === undefined || style[k] === null) delete style[k]; });
      // 统一 fill 与 color
      if (style.color == null && style.fill == null) style.color = '#ffffff';
      if (style.fill == null && style.color != null) style.fill = style.color;
      // 阴影与描边容错
      if (style.dropShadow === true && (style.dropShadowColor == null)) style.dropShadowColor = 0x000000;
      if (!style.stroke && (style.strokeThickness == null)) style.strokeThickness = 0;
    } catch {}
    if (style.zIndex === undefined) {
      style.zIndex = 5; // 默认高于背景，低于标题
    }
    const elementId = p.elementId || p.id || `text_${Date.now()}`;
    
    if (!text) {
      return this.createErrorResult('Missing required parameter: text');
    }

    try {
      // 预判阻塞模式（用于默认皮肤判断）
      const blocking: boolean = !!p.blocking || !!p.waitForClick;
      // Padding: support number | {x,y} | {top,bottom,left,right};
      // If not provided, derive from fontSize for visually balanced padding.
      const fontSizeNum = (() => { try { return style.fontSize != null ? parseInt(String(style.fontSize)) : 16; } catch { return 16; } })();
      const autoPadX = Math.max(12, Math.ceil(fontSizeNum * 0.75));
      const autoPadY = Math.max(8, Math.ceil(fontSizeNum * 0.55));
      const padRawAll = p.padding ?? p.backgroundPadding ?? p.panel?.padding;
      const padX = padRawAll == null ? autoPadX : (typeof padRawAll === 'number' ? padRawAll : (padRawAll?.x ?? autoPadX));
      const padY = padRawAll == null ? autoPadY : (typeof padRawAll === 'number' ? padRawAll : (padRawAll?.y ?? autoPadY));
      const padLeft = typeof padRawAll === 'object' && padRawAll.left != null ? Number(padRawAll.left) : padX;
      const padRight = typeof padRawAll === 'object' && padRawAll.right != null ? Number(padRawAll.right) : padX;
      const padTop = typeof padRawAll === 'object' && padRawAll.top != null ? Number(padRawAll.top) : padY;
      const padBottom = typeof padRawAll === 'object' && padRawAll.bottom != null ? Number(padRawAll.bottom) : padY;
      const elementConfig: ElementConfig = {
        id: elementId,
        type: 'text',
        position: { x, y },
        content: text,
        style,
        visible: true
      };

      const element = context.renderManager.createElement(elementConfig);
      // Background skin (nine-slice) if skinId is provided
      let createdBgId: string | null = null;
      try {
        const skinId: string | undefined = (p.skinId || p.panel?.skinId);
        // Use per-side padding computed above
        if (skinId && (context.renderManager as any)?.getNode) {
          const sk = (context.resourceManager as any)?.getSkin?.(skinId);
          // Only use mapped skin; do not fallback to arbitrary resource id
          const imageId = sk?.imageId;
          // Prefer explicit URL from skin; otherwise resolve by imageId
          let url: string | undefined = (sk && (sk as any).url) ? (sk as any).url : (imageId ? (context.resourceManager as any)?.getResource?.(imageId)?.url : undefined);
          const addVer = (u?: string): string | undefined => {
            if (!u) return u;
            try {
              // Do NOT append query to blob:/data:/file: URLs — it breaks loading
              const low = String(u).toLowerCase();
              if (low.startsWith('blob:') || low.startsWith('data:') || low.startsWith('file:')) return u;
              const g: any = globalThis as any;
              const ver = g.__ASSET_VERSION || g.__BUILD_VERSION || g.__GAME_ASSET_VERSION || 'dev';
              const hashIdx = u.indexOf('#');
              const base = hashIdx >= 0 ? u.slice(0, hashIdx) : u;
              const hash = hashIdx >= 0 ? u.slice(hashIdx) : '';
              const sep = base.indexOf('?') >= 0 ? '&' : '?';
              return `${base}${sep}v=${encodeURIComponent(String(ver))}${hash}`;
            } catch { return u; }
          };
          if (!url && imageId) {
            // Fallback: construct from conventional path with optional asset base
            try {
              const g2: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
              const base: string = String(g2?.__ASSET_BASE__ || g2?.__PROJECT_BASE__ || '/');
              const joined = base.endsWith('/') ? `${base}images/${imageId}.svg` : `${base}/images/${imageId}.svg`;
              url = addVer(joined);
            } catch {
              url = addVer(`/images/${imageId}.svg`);
            }
          } else {
            url = addVer(url);
          }
          const slice = sk?.slice || { left: 16, top: 16, right: 16, bottom: 16 };
          const node: any = (context.renderManager as any).getNode(elementId);
          // Prefer local bounds to avoid filter/rounding biases and keep symmetric paddings
          const lb = node?.getLocalBounds ? node.getLocalBounds() : null;
          if (lb && url) {
            const bgId = `${elementId}__bg`;
            const zUnder = (style.zIndex != null ? Number(style.zIndex) : 5) - 1;
            // Compute visual expansion caused by stroke and dropShadow (not included in localBounds)
            const strokeTh = Number(style.strokeThickness || 0);
            const dsEnabled = !!style.dropShadow;
            const dsDist = dsEnabled ? Number(style.dropShadowDistance || 0) : 0;
            const dsAngle = dsEnabled ? (typeof style.dropShadowAngle === 'number' ? style.dropShadowAngle : (parseFloat(String(style.dropShadowAngle)) || 0)) : 0;
            const dsBlur = dsEnabled ? Number(style.dropShadowBlur || 0) : 0;
            const dsx = Math.cos(dsAngle) * dsDist;
            const dsy = Math.sin(dsAngle) * dsDist;
            const blurPad = dsBlur * 0.6; // perceptual spread
            const strokePad = strokeTh * 0.5;
            const extraLeft = Math.max(0, -dsx) + blurPad + strokePad;
            const extraRight = Math.max(0, dsx) + blurPad + strokePad;
            const extraTop = Math.max(0, -dsy) + blurPad + strokePad;
            const extraBottom = Math.max(0, dsy) + blurPad + strokePad;

            // Compute from local bounds, then make padding strictly symmetric via integer pads
            const textLeft = (node.x ?? 0) + lb.x;
            const textTop = (node.y ?? 0) + lb.y;
            const textW = lb.width;
            const textH = lb.height;
            // float pads with visual extras
            const padL = padLeft + extraLeft;
            const padR = padRight + extraRight;
            const padT = padTop + extraTop;
            const padB = padBottom + extraBottom;
            // integer symmetric pads (average both sides to avoid 1px drift)
            const intPadX = Math.max(0, Math.round((padL + padR) / 2));
            const intPadY = Math.max(0, Math.round((padT + padB) / 2));
            let bgX = Math.round(textLeft - intPadX);
            let bgY = Math.round(textTop - intPadY);
            let bgW = Math.round(textW + intPadX * 2);
            let bgH = Math.round(textH + intPadY * 2);
            // Debug print for padding and bounds
            try {
              (context.logger || console).info('DEBUG_SHOW_TEXT', {
                elementId,
                fontSize: fontSizeNum,
                padding: { left: padLeft, right: padRight, top: padTop, bottom: padBottom },
                strokeThickness: Number(style.strokeThickness || 0),
                dropShadow: {
                  enabled: !!style.dropShadow,
                  distance: Number(style.dropShadowDistance || 0),
                  angle: typeof style.dropShadowAngle === 'number' ? style.dropShadowAngle : (parseFloat(String(style.dropShadowAngle)) || 0),
                  blur: Number(style.dropShadowBlur || 0),
                },
                text: { x: (node as any).x ?? 0, y: (node as any).y ?? 0, lbx: lb.x, lby: lb.y, lbw: lb.width, lbh: lb.height },
                background: { x: bgX, y: bgY, w: bgW, h: bgH }
              });
            } catch {}

            (context.renderManager as any).createElement({
              id: bgId,
              type: 'nine-slice',
              position: { x: bgX, y: bgY },
              size: { width: bgW, height: bgH },
              src: url,
              visible: true,
              style: { zIndex: zUnder },
              slice
            } as any);
            createdBgId = bgId;

            // After render: compute actual rendered paddings from real bounds
            try {
              const bgNode: any = (context.renderManager as any).getNode(bgId);
              const tNode: any = (context.renderManager as any).getNode(elementId);
              const tb = tNode?.getBounds ? tNode.getBounds() : null;
              const bb = bgNode?.getBounds ? bgNode.getBounds() : null;
              if (tb && bb) {
                const sL = Number((slice as any)?.left || 0), sT = Number((slice as any)?.top || 0), sR = Number((slice as any)?.right || 0), sB = Number((slice as any)?.bottom || 0);
                // content-area paddings (remove slice thickness)
                const padRenderTop = Math.round((tb.y) - (bb.y + sT));
                const padRenderBottom = Math.round((bb.y + bb.height - sB) - (tb.y + tb.height));
                const padRenderLeft = Math.round((tb.x) - (bb.x + sL));
                const padRenderRight = Math.round((bb.x + bb.width - sR) - (tb.x + tb.width));
                (context.logger || console).info('DEBUG_SHOW_TEXT_RENDERED', {
                  elementId,
                  textBounds: { x: Math.round(tb.x), y: Math.round(tb.y), w: Math.round(tb.width), h: Math.round(tb.height) },
                  bgBounds: { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) },
                  renderedPadding: { top: padRenderTop, bottom: padRenderBottom, left: padRenderLeft, right: padRenderRight }
                });

                // Persist slice + content paddings on bg node for UPDATE_TEXT reuse
                try {
                  const bgReal: any = (context.renderManager as any).getNode(bgId);
                  if (bgReal) {
                    (bgReal as any).__slice = { left: sL, top: sT, right: sR, bottom: sB };
                    (bgReal as any).__contentPad = { left: padRenderLeft, right: padRenderRight, top: padRenderTop, bottom: padRenderBottom };
                  }
                } catch {}

                // Optional: draw semi-transparent overlay rectangles for verification
                // overlay removed
              }
            } catch {}
          }
        }
      } catch {}
      
      context.logger.debug(`Text displayed: ${text} at (${x}, ${y})`);
      // 支持阻塞模式：等待点击继续（已在前面定义 blocking）
      // 默认阻塞文本点击后移除（可通过 dismissOnContinue:false 关闭）
      const dismissOnContinue: boolean = p.dismissOnContinue === false ? false : (!!p.blocking || !!p.waitForClick);
      if (blocking) {
        // Only propagate panelResourceId when explicit skin exists and is resolvable
        const sid = p.skinId || p.panel?.skinId;
        const panelResourceId = sid ? (context.resourceManager as any)?.getSkin?.(sid)?.imageId : undefined;
        context.eventManager.emit('text_displayed', { elementId, blocking: true, dismissOnContinue, panelResourceId });
      await new Promise<void>((resolve) => {
          const once = (payload?: any) => {
            if (!payload || payload.elementId === elementId) resolve();
          };
          context.eventManager.once('text_continue', once);
        });
        if (dismissOnContinue && (context.renderManager as any)?.removeElement) {
          try { if (createdBgId) (context.renderManager as any).removeElement(createdBgId); } catch {}
          try { (context.renderManager as any).removeElement(elementId); } catch {}
        }
      } else {
        context.eventManager.emit('text_displayed', { elementId, blocking: false, dismissOnContinue: false, panelResourceId: (p.useBackgroundImage === true ? (p.backgroundResourceId || p.panel?.resourceId) : undefined) });
        // 非阻塞文本应不拦截指针事件，允许点击穿透到下层元素
        try {
          const textNode: any = (context.renderManager as any)?.getNode?.(elementId);
          if (textNode) { textNode.eventMode = 'none'; textNode.cursor = 'inherit'; }
        } catch {}
        try {
          if (createdBgId) {
            const bgNode: any = (context.renderManager as any)?.getNode?.(createdBgId);
            if (bgNode) { bgNode.eventMode = 'none'; bgNode.cursor = 'inherit'; }
          }
        } catch {}
      }
      
      return this.createSuccessResult({ elementId, text, position: { x, y } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to show text: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['text'];
  }

  private interpolate(text: string, context: CommandContext): string {
    try {
      const sm: any = (context as any).stateManager;
      return text.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
        const path = String(expr).trim();
        let key = path.startsWith('gameState.') ? path.slice('gameState.'.length) : path;
        const parts = key.split('.');
        let val: any = sm?.getVariable ? sm.getVariable(parts[0]) : undefined;
        for (let i = 1; i < parts.length; i++) val = val != null ? val[parts[i]] : undefined;
        return val != null ? String(val) : '';
      });
    } catch { return text; }
  }
}
