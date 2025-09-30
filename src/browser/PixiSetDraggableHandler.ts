import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveIdFromBraces } from '../utils/ParamResolver';

export class PixiSetDraggableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_DRAGGABLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    let id: string | undefined = resolveIdFromBraces(p.elementId, context);
    const draggable = p.draggable !== false;
    const dragType: string | undefined = p.dragType;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = context.renderManager as any;
    const state = (context as any).stateManager;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);
    const elementNode: any = (node as any).__elementNode;

    // Clear previous handlers
    if (node.__dragHandlers) {
      try {
        node.off('pointerdown', node.__dragHandlers.down);
        node.off('pointerup', node.__dragHandlers.up);
        node.off('pointerupoutside', node.__dragHandlers.upOutside);
        node.off('pointermove', node.__dragHandlers.move);
        const st = rm.getStage?.();
        if (st) {
          st.off('pointermove', node.__dragHandlers.stageMove);
          st.off('pointerup', node.__dragHandlers.stageUp);
          st.off('pointerupoutside', node.__dragHandlers.stageUp);
        }
        try { window.removeEventListener('pointerup', node.__dragHandlers.winUp); } catch {}
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
    // Ensure stage can receive global pointer events during drag
    try {
      const app = rm.getApp?.();
      const stage = rm.getStage?.();
      if (app && stage) {
        stage.eventMode = 'static';
        // Make the whole screen hittable so stage gets pointer events even when leaving the dragged node
        stage.hitArea = app.screen;
      }
    } catch {}

    let dragging = false; let offset = { x: 0, y: 0 };
    const down = (e: any) => {
      // 任何进行中的补间/时间轴应在拖拽开始时被取消
      try { if (typeof (node as any).__animToken !== 'number') (node as any).__animToken = 0; (node as any).__animToken++; } catch {}
      dragging = true; node.cursor = 'grabbing'; (node as any).__dragging = true;
      const pos = e.data.getLocalPosition(node.parent);
      const basePos = elementNode?.getBaseSnapshot?.();
      const currentX = basePos?.x ?? node.x;
      const currentY = basePos?.y ?? node.y;
      offset.x = pos.x - currentX; offset.y = pos.y - currentY;
      context.eventManager.emit('drag_start', { elementId: id, startPosition: { x: currentX, y: currentY }, timestamp: Date.now() });
    };
    const up = () => {
      if (!dragging) return; dragging = false; node.cursor = 'grab'; (node as any).__dragging = false;
      const basePos = elementNode?.getBaseSnapshot?.();
      const endX = basePos?.x ?? node.x;
      const endY = basePos?.y ?? node.y;
      context.eventManager.emit('drag_end', { elementId: id, endPosition: { x: endX, y: endY }, timestamp: Date.now() });
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
          try {
            state?.setVariable?.('last_drop_element_ID', id);
            const resId = (node as any).resourceId || '';
            state?.setVariable?.('last_drop_resource_ID', resId || '');
          } catch {}
          context.eventManager.emit('drop:success', payload);
          // 同时按投放区ID发出专属信号，便于无需表达式的事件监听
          try { console.log('[emit]', z.id, payload); } catch {}
          context.eventManager.emit(z.id, payload);
          break;
        }
      }
    };
    const upOutside = () => { dragging = false; node.cursor = 'grab'; (node as any).__dragging = false; };
    const move = (e: any) => {
      if (!dragging) return;
      const pos = e.data.getLocalPosition(node.parent);
      const nx = pos.x - offset.x;
      const ny = pos.y - offset.y;
      if (elementNode?.setBasePosition) {
        elementNode.setBasePosition(nx, ny);
        elementNode.update(0);
      } else {
        node.x = nx;
        node.y = ny;
      }
    };
    // Global handlers bound to stage so drag doesn't break when pointer leaves the sprite
    const stage = rm.getStage?.();
    const stageMove = (e: any) => move(e);
    const stageUp = () => up();
    const winUp = (e?: any) => { try { up(); } catch {} };

    node.on('pointerdown', down);
    node.on('pointerup', up);
    node.on('pointerupoutside', upOutside);
    node.on('pointermove', move);
    if (stage) {
      try {
        stage.on('pointermove', stageMove);
        stage.on('pointerup', stageUp);
        stage.on('pointerupoutside', stageUp);
      } catch {}
    }
    try { window.addEventListener('pointerup', winUp, { passive: true }); } catch {}
    node.__dragHandlers = { down, up, upOutside, move, stageMove, stageUp, winUp };

    return this.createSuccessResult({ elementId: id, draggable: true, dragType });
  }
}
