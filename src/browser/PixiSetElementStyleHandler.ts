import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * Pixi 版 SET_ELEMENT_STYLE
 * 支持最常见的 display/opacity/visibility 等样式更新。
 */
export class PixiSetElementStyleHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_ELEMENT_STYLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = p.elementId;
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
        // position (optional)
        if (style.left !== undefined || style.top !== undefined) {
          const x = style.left !== undefined ? Number(style.left) : undefined;
          const y = style.top !== undefined ? Number(style.top) : undefined;
          (updates as any).position = { x, y };
        }

        rm.updateElement(id, updates);
        // Also apply to paired background (nine-slice) if exists: `${id}__bg`
        const bgId = `${id}__bg`;
        const bgNode = rm.getNode ? rm.getNode(bgId) : null;
        if (bgNode) {
          const bgUpdates: any = {};
          if (style.display !== undefined) bgUpdates.visible = style.display !== 'none';
          if (style.visibility !== undefined) bgUpdates.visible = style.visibility !== 'hidden';
          if (style.opacity !== undefined) { try { bgNode.alpha = Number(style.opacity); } catch {} }
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
