import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveElementId } from '../utils/ParamResolver';

/**
 * 设置元素可拖拽指令处理器
 */
export class SetDraggableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_DRAGGABLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId: rawId, draggable = true, constraints } = command.parameters;
    const elementId: string | undefined = resolveElementId(rawId, context) || rawId;
    
    if (!elementId) {
      return this.createErrorResult('Missing required parameter: elementId');
    }

    try {
      // 直接使用DOM API获取元素
      const element = document.getElementById(elementId) as HTMLElement;
      if (!element) {
        return this.createErrorResult(`Element not found: ${elementId}`);
      }

      // 设置拖拽属性
      element.draggable = draggable;
      
      if (constraints) {
        // 使用dataset存储拖拽约束
        element.dataset.dragConstraints = JSON.stringify(constraints);
      }

      // 如果启用拖拽，添加拖拽事件监听器
      if (draggable) {
        this.setupDragEvents(element, context);
      } else {
        this.removeDragEvents(element);
      }
      
      context.logger.debug(`Element ${elementId} draggable set to ${draggable}`);
      
      return this.createSuccessResult({ 
        elementId, 
        draggable, 
        constraints: constraints || null 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to set draggable: ${errorMessage}`);
    }
  }

  private setupDragEvents(element: any, context: CommandContext) {
    // 拖拽开始事件
    element.onDragStart = (event: any) => {
      context.eventManager.emit('drag_start', {
        elementId: element.id,
        startPosition: { x: event.x, y: event.y },
        timestamp: Date.now()
      });
    };

    // 拖拽中事件
    element.onDrag = (event: any) => {
      context.eventManager.emit('drag_move', {
        elementId: element.id,
        position: { x: event.x, y: event.y },
        timestamp: Date.now()
      });
    };

    // 拖拽结束事件
    element.onDragEnd = (event: any) => {
      context.eventManager.emit('drag_end', {
        elementId: element.id,
        endPosition: { x: event.x, y: event.y },
        timestamp: Date.now()
      });
    };
  }

  private removeDragEvents(element: any) {
    element.onDragStart = null;
    element.onDrag = null;
    element.onDragEnd = null;
  }

  protected getRequiredParameters(): string[] {
    return ['elementId'];
  }
}
