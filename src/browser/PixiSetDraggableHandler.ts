import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class PixiSetDraggableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_DRAGGABLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = p.elementId;
    const draggable = p.draggable !== false;
    const dragType: string | undefined = p.dragType;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    // Clear previous handlers
    if (node.__dragHandlers) {
      try {
        node.off('pointerdown', node.__dragHandlers.down);
        node.off('pointerup', node.__dragHandlers.up);
        node.off('pointerupoutside', node.__dragHandlers.upOutside);
        node.off('pointermove', node.__dragHandlers.move);
      } catch {}
      node.__dragHandlers = undefined;
    }

    if (!draggable) {
      node.eventMode = 'auto';
      node.cursor = 'default';
      return this.createSuccessResult({ elementId: id, draggable: false });
    }

    node.eventMode = 'static';
    node.cursor = 'grab';
    node.dragType = dragType;

    let dragging = false; let offset = { x: 0, y: 0 };
    const down = (e: any) => {
      // 任何进行中的补间/时间轴应在拖拽开始时被取消
      try { if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0; (node as any).__animToken++; } catch {}
      dragging = true; node.cursor = 'grabbing';
      const pos = e.data.getLocalPosition(node.parent);
      offset.x = pos.x - node.x; offset.y = pos.y - node.y;
      context.eventManager.emit('drag_start', { elementId: id, startPosition: { x: node.x, y: node.y }, timestamp: Date.now() });
    };
    const up = () => {
      if (!dragging) return; dragging = false; node.cursor = 'grab';
      context.eventManager.emit('drag_end', { elementId: id, endPosition: { x: node.x, y: node.y }, timestamp: Date.now() });
      // Robust hit test: use global bounds rectangle intersection
      const zones = rm.getDropZones ? rm.getDropZones() : [];
      const b = node.getBounds();
      const draggedRect = { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
      const intersects = (z: any) => {
        const zr = { left: z.x, top: z.y, right: z.x + z.w, bottom: z.y + z.h };
        return !(draggedRect.right < zr.left || draggedRect.left > zr.right || draggedRect.bottom < zr.top || draggedRect.top > zr.bottom);
      };
      for (const z of zones) {
        const acceptOk = !z.accept || !dragType || z.accept.includes(dragType);
        if (acceptOk && intersects(z)) {
          const payload = { dropZoneId: z.id, draggedElementId: id, dragType };
          // 便于调试：在控制台打印一次
          try { console.log('[emit] drop:success', payload); } catch {}
          context.eventManager.emit('drop:success', payload);
          // 同时按投放区ID发出专属信号，便于无需表达式的事件监听
          try { console.log('[emit]', z.id, payload); } catch {}
          context.eventManager.emit(z.id, payload);
          break;
        }
      }
    };
    const upOutside = () => { dragging = false; node.cursor = 'grab'; };
    const move = (e: any) => { if (!dragging) return; const pos = e.data.getLocalPosition(node.parent); node.x = pos.x - offset.x; node.y = pos.y - offset.y; };

    node.on('pointerdown', down);
    node.on('pointerup', up);
    node.on('pointerupoutside', upOutside);
    node.on('pointermove', move);
    node.__dragHandlers = { down, up, upOutside, move };

    return this.createSuccessResult({ elementId: id, draggable: true, dragType });
  }
}
