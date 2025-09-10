import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';

/**
 * 拖拽结束事件处理器
 */
export class DragEndHandler extends BaseCommandHandler {
  readonly type = CommandType.DRAG_END;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { elementId, endPosition, dropZoneId } = command.parameters;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing required parameter: elementId'
        };
      }

      // 获取元素
      const element = document.getElementById(elementId) as HTMLElement;
      
      if (!element) {
        return {
          success: false,
          error: `Element with id '${elementId}' not found`
        };
      }

      // 获取拖拽开始信息
      const startX = element.dataset.dragStartX;
      const startY = element.dataset.dragStartY;
      const startTime = element.dataset.dragStartTime;

      // 计算拖拽距离和时间
      const dragDistance = startX && startY && endPosition ? 
        Math.sqrt(
          Math.pow(endPosition.x - parseFloat(startX), 2) + 
          Math.pow(endPosition.y - parseFloat(startY), 2)
        ) : 0;
      
      const dragDuration = startTime ? Date.now() - parseInt(startTime) : 0;

      // 清除拖拽状态
      delete element.dataset.dragging;
      delete element.dataset.dragStartTime;
      delete element.dataset.dragStartX;
      delete element.dataset.dragStartY;

      // 触发拖拽结束事件
      context.eventManager.emit('drag:end', {
        elementId,
        endPosition,
        dropZoneId,
        dragDistance,
        dragDuration,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: { 
          elementId, 
          endPosition, 
          dropZoneId,
          dragDistance,
          dragDuration
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to end drag: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  validate(command: GameCommand) {
    const { elementId } = command.parameters;
    
    if (!elementId || typeof elementId !== 'string') {
      return {
        valid: false,
        errors: [{
          field: 'elementId',
          message: 'elementId must be a non-empty string',
          code: 'INVALID_ELEMENT_ID'
        }]
      };
    }

    return { 
      valid: true,
      errors: []
    };
  }
}