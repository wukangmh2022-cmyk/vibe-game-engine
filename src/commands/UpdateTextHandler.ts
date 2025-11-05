import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveElementId } from '../utils/ParamResolver';

export class UpdateTextHandler extends BaseCommandHandler {
  readonly type = CommandType.UPDATE_TEXT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const elementId: string = (resolveElementId(p.elementId, context) || p.id) as any;
    if (!elementId) return this.createErrorResult('Missing required parameter: elementId');

    const pos = p.position || {};
    const x: number | undefined = p.x ?? pos.x;
    const y: number | undefined = p.y ?? pos.y;
    const style = p.style || undefined;
    let text: string | undefined = undefined;
    if (typeof p.text === 'string') {
      text = this.interpolate(p.text, context);
    } else if (p.text !== undefined) {
      // 不兼容对象形式的 text，保持模板规范
      return this.createErrorResult('Invalid text parameter: must be a string.');
    }

    if (text !== undefined) {
      (context.renderManager as any).updateElement(elementId, { type: 'text', content: text } as Partial<ElementConfig>);
    }
    if (x !== undefined || y !== undefined) {
      (context.renderManager as any).updateElement(elementId, { position: { x: x ?? 0, y: y ?? 0 } } as Partial<ElementConfig>);
    }
    if (style) {
      (context.renderManager as any).updateElement(elementId, { style } as Partial<ElementConfig>);
    }

    // Recalculate background nine-slice to match new text bounds (keep previous paddings)
    try {
      // Wait up to 3 frames so Text metrics are updated (robust on slower ticks)
      const waitFrame = () => new Promise<void>((resolve) => (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(() => resolve()) : setTimeout(() => resolve(), 0));
      await waitFrame(); await waitFrame(); await waitFrame();
      const getNode = (context.renderManager as any)?.getNode?.bind((context.renderManager as any));
      const tNode: any = getNode ? getNode(elementId) : undefined;
      const bgId = `${elementId}__bg`;
      const bgNode: any = getNode ? getNode(bgId) : undefined;
      if (tNode && bgNode && tNode.getBounds && bgNode.getBounds) {
        const tb = tNode.getBounds();
        const bb = bgNode.getBounds();
        // Infer slice from NineSlicePlane or fallback to 16
        const sl = Number((bgNode as any).__slice?.left ?? bgNode.leftWidth ?? 16);
        const sr = Number((bgNode as any).__slice?.right ?? bgNode.rightWidth ?? 16);
        const st = Number((bgNode as any).__slice?.top ?? bgNode.topHeight ?? 16);
        const sb = Number((bgNode as any).__slice?.bottom ?? bgNode.bottomHeight ?? 16);
        // Prefer stored content paddings from creation time
        const stored = (bgNode as any).__contentPad;
        const padTop = stored?.top ?? Math.round((tb.y) - (bb.y + st));
        const padBottom = stored?.bottom ?? Math.round((bb.y + bb.height - sb) - (tb.y + tb.height));
        const padLeft = stored?.left ?? Math.round((tb.x) - (bb.x + sl));
        const padRight = stored?.right ?? Math.round((bb.x + bb.width - sr) - (tb.x + tb.width));

        // Preserve top-left anchor of content area (do not move bg.x/bg.y)
        const contentX = bb.x + sl;
        const contentY = bb.y + st;
        // New content size keeps previous paddings
        const newContentW = Math.round(tb.width + padLeft + padRight);
        const newContentH = Math.round(tb.height + padTop + padBottom);
        const newBgX = Math.round(contentX - sl); // == bb.x
        const newBgY = Math.round(contentY - st); // == bb.y
        const newBgW = Math.round(newContentW + sl + sr);
        const newBgH = Math.round(newContentH + st + sb);
        (context.renderManager as any).updateElement(bgId, { position: { x: newBgX, y: newBgY }, size: { width: newBgW, height: newBgH } } as Partial<ElementConfig>);
        // Debug (optional):
        try { (context.logger || console).info('DEBUG_UPDATE_TEXT', { elementId, tb, bb, pads: { padTop, padBottom, padLeft, padRight }, newBg: { x:newBgX, y:newBgY, w:newBgW, h:newBgH } }); } catch {}
      }
    } catch {}

    return this.createSuccessResult({ elementId, text, position: (x!==undefined||y!==undefined) ? { x: x ?? 0, y: y ?? 0 } : undefined });
  }

  private interpolate(text: string, context: CommandContext): string {
    const sm = (context as any).stateManager;
    return text.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
      const path = String(expr).trim();
      let key = path.startsWith('gameState.') ? path.slice('gameState.'.length) : path;
      const parts = key.split('.');
      let val: any = sm.getVariable(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        val = val != null ? val[parts[i]] : undefined;
      }
      return val != null ? String(val) : '';
    });
  }

  protected getRequiredParameters(): string[] { return ['elementId']; }
}
