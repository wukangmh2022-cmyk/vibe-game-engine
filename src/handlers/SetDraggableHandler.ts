import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult, IRendererManager } from '../types';

/**
 * 设置元素拖拽属性的指令处理器
 */
export class SetDraggableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_DRAGGABLE;

  constructor(private renderManager: IRendererManager) {
    super();
  }

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { elementId, draggable = true, constraints } = command.parameters;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing required parameter: elementId'
        };
      }

      // 注意：IRendererManager接口中没有getElement方法
      // 这里需要通过DOM API或其他方式获取元素
      const element = document.getElementById(elementId) as HTMLElement;
      
      if (!element) {
        return {
          success: false,
          error: `Element with id '${elementId}' not found`
        };
      }

      if (draggable) {
        this.enableDragging(element, constraints);
      } else {
        this.disableDragging(element);
      }

      return {
        success: true,
        data: { elementId, draggable }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set draggable: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private enableDragging(element: HTMLElement, constraints?: any) {
    element.draggable = true;
    element.style.cursor = 'grab';
    
    // 添加拖拽事件监听器
    element.addEventListener('dragstart', this.handleDragStart.bind(this));
    element.addEventListener('drag', this.handleDrag.bind(this));
    element.addEventListener('dragend', this.handleDragEnd.bind(this));
    
    // 存储约束条件
    if (constraints) {
      element.dataset.dragConstraints = JSON.stringify(constraints);
    }
  }

  private disableDragging(element: HTMLElement) {
    element.draggable = false;
    element.style.cursor = 'default';
    
    // 移除拖拽事件监听器
    element.removeEventListener('dragstart', this.handleDragStart);
    element.removeEventListener('drag', this.handleDrag);
    element.removeEventListener('dragend', this.handleDragEnd);
    
    // 清除约束条件
    delete element.dataset.dragConstraints;
  }

  private handleDragStart(event: DragEvent) {
    const element = event.target as HTMLElement;
    element.style.cursor = 'grabbing';
    
    // 存储初始位置
    const rect = element.getBoundingClientRect();
    event.dataTransfer?.setData('text/plain', JSON.stringify({
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      elementId: element.id
    }));
  }

  private handleDrag(event: DragEvent) {
    // 拖拽过程中的处理
    const element = event.target as HTMLElement;
    
    // 检查约束条件
    const constraintsData = element.dataset.dragConstraints;
    if (constraintsData) {
      const constraints = JSON.parse(constraintsData);
      // 应用约束逻辑
      this.applyConstraints(element, event, constraints);
    }
  }

  private handleDragEnd(event: DragEvent) {
    const element = event.target as HTMLElement;
    element.style.cursor = 'grab';
  }

  private applyConstraints(element: HTMLElement, event: DragEvent, constraints: any) {
    // 实现约束逻辑，如边界限制、网格对齐等
    if (constraints.bounds) {
      // 边界约束
      const { minX, maxX, minY, maxY } = constraints.bounds;
      // 应用边界限制逻辑
    }
    
    if (constraints.grid) {
      // 网格对齐
      const { size } = constraints.grid;
      // 应用网格对齐逻辑
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