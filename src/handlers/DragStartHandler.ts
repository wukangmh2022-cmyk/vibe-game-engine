import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';

/**
 * 拖拽开始事件处理器
 */
export class DragStartHandler extends BaseCommandHandler {
  readonly type = CommandType.DRAG_START;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { elementId, startPosition } = command.parameters;

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

      // 记录拖拽开始状态
      element.dataset.dragging = 'true';
      element.dataset.dragStartTime = Date.now().toString();
      
      if (startPosition) {
        element.dataset.dragStartX = startPosition.x.toString();
        element.dataset.dragStartY = startPosition.y.toString();
      }

      // 触发拖拽开始事件
      context.eventManager.emit('drag:start', {
        elementId,
        startPosition,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: { elementId, startPosition }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to start drag: ${error instanceof Error ? error.message : 'Unknown error'}`
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