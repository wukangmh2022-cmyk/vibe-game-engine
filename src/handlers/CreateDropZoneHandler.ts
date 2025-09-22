import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';

/**
 * 创建投放区域处理器
 */
export class CreateDropZoneHandler extends BaseCommandHandler {
  readonly type = CommandType.CREATE_DROP_ZONE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { 
        dropZoneId, 
        position, 
        size, 
        acceptTypes, 
        style,
        label 
      } = command.parameters;

      if (!dropZoneId) {
        return {
          success: false,
          error: 'Missing required parameter: dropZoneId'
        };
      }

      // 检查是否已存在相同ID的投放区域
      if (document.getElementById(dropZoneId)) {
        return {
          success: false,
          error: `Drop zone with id '${dropZoneId}' already exists`
        };
      }

      // 创建投放区域元素
      const dropZone = document.createElement('div');
      dropZone.id = dropZoneId;
      dropZone.className = 'drop-zone';
      
      // 设置样式
      const defaultStyle = {
        position: 'absolute',
        border: '2px dashed #ccc',
        borderRadius: '8px',
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      };

      Object.assign(dropZone.style, defaultStyle, style);

      // 设置位置和大小
      if (position) {
        dropZone.style.left = `${position.x}px`;
        dropZone.style.top = `${position.y}px`;
      }
      
      if (size) {
        dropZone.style.width = `${size.width}px`;
        dropZone.style.height = `${size.height}px`;
      }

      // 设置标签
      if (label) {
        dropZone.textContent = label;
      }

      // 设置数据属性
      dropZone.dataset.dropZone = 'true';
      if (acceptTypes && acceptTypes.length > 0) {
        dropZone.dataset.acceptTypes = acceptTypes.join(',');
      }

      // 添加拖拽事件监听器
      this.addDropZoneListeners(dropZone, context);

      // 添加到DOM
      const container = document.body; // 或者指定的容器
      container.appendChild(dropZone);

      return {
        success: true,
        data: { dropZoneId, position, size }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create drop zone: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private addDropZoneListeners(dropZone: HTMLElement, context: CommandContext) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = 'rgba(0, 150, 255, 0.1)';
      dropZone.style.borderColor = '#0096ff';
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      dropZone.style.borderColor = '#ccc';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      
      // 重置样式
      dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      dropZone.style.borderColor = '#ccc';

      // 获取拖拽的元素ID
      const draggedElementId = e.dataTransfer?.getData('text/plain');

      if (draggedElementId) {
        try {
          context.stateManager?.setVariable('last_drop_element_ID', draggedElementId);
          const draggedEl = document.getElementById(draggedElementId) as HTMLElement | null;
          const resourceId = draggedEl?.dataset?.resourceId || draggedEl?.getAttribute?.('data-resource-id') || '';
          context.stateManager?.setVariable('last_drop_resource_ID', resourceId || '');
        } catch {}
        // 触发投放事件
        context.eventManager.emit('drop:success', {
          dropZoneId: dropZone.id,
          draggedElementId,
          position: { x: e.clientX, y: e.clientY },
          timestamp: Date.now()
        });
      }
    });
  }

  validate(command: GameCommand) {
    const { dropZoneId } = command.parameters;
    
    if (!dropZoneId || typeof dropZoneId !== 'string') {
      return {
        valid: false,
        errors: [{
          field: 'dropZoneId',
          message: 'dropZoneId must be a non-empty string',
          code: 'INVALID_DROP_ZONE_ID'
        }]
      };
    }

    return { 
      valid: true,
      errors: []
    };
  }
}