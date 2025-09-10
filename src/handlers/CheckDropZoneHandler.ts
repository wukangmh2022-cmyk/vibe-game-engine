import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';

/**
 * 检查投放区域碰撞处理器
 */
export class CheckDropZoneHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_DROP_ZONE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { elementId, position, dropZoneId } = command.parameters;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing required parameter: elementId'
        };
      }

      // 获取拖拽元素
      const element = document.getElementById(elementId) as HTMLElement;
      if (!element) {
        return {
          success: false,
          error: `Element with id '${elementId}' not found`
        };
      }

      let targetDropZones: HTMLElement[] = [];
      
      if (dropZoneId) {
        // 检查指定的投放区域
        const dropZone = document.getElementById(dropZoneId) as HTMLElement;
        if (dropZone && dropZone.dataset.dropZone === 'true') {
          targetDropZones = [dropZone];
        }
      } else {
        // 检查所有投放区域
        targetDropZones = Array.from(document.querySelectorAll('[data-drop-zone="true"]')) as HTMLElement[];
      }

      const collisions: any[] = [];
      const elementRect = element.getBoundingClientRect();
      
      // 如果提供了position参数，使用该位置进行碰撞检测
      const checkRect = position ? {
        left: position.x,
        top: position.y,
        right: position.x + elementRect.width,
        bottom: position.y + elementRect.height,
        width: elementRect.width,
        height: elementRect.height
      } : elementRect;

      for (const dropZone of targetDropZones) {
        const dropZoneRect = dropZone.getBoundingClientRect();
        
        // 检查碰撞
        const isColliding = this.checkCollision(checkRect, dropZoneRect);
        
        if (isColliding) {
          // 检查类型匹配
          const acceptTypes = dropZone.dataset.acceptTypes?.split(',') || [];
          const elementType = element.dataset.dragType || 'default';
          
          const typeMatches = acceptTypes.length === 0 || acceptTypes.includes(elementType);
          
          collisions.push({
            dropZoneId: dropZone.id,
            elementId,
            typeMatches,
            overlap: this.calculateOverlap(checkRect, dropZoneRect),
            dropZoneRect: {
              x: dropZoneRect.left,
              y: dropZoneRect.top,
              width: dropZoneRect.width,
              height: dropZoneRect.height
            }
          });
        }
      }

      // 按重叠面积排序，重叠最大的在前
      collisions.sort((a, b) => b.overlap - a.overlap);

      return {
        success: true,
        data: {
          elementId,
          collisions,
          hasCollision: collisions.length > 0,
          bestMatch: collisions.length > 0 ? collisions[0] : null
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to check drop zone: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private checkCollision(rect1: any, rect2: DOMRect): boolean {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }

  private calculateOverlap(rect1: any, rect2: DOMRect): number {
    const overlapLeft = Math.max(rect1.left, rect2.left);
    const overlapTop = Math.max(rect1.top, rect2.top);
    const overlapRight = Math.min(rect1.right, rect2.right);
    const overlapBottom = Math.min(rect1.bottom, rect2.bottom);

    if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
      return (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
    }
    
    return 0;
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