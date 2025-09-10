import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult, IRendererManager } from '../types';

/**
 * 设置元素位置的指令处理器
 */
export class SetPositionHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_POSITION;

  constructor(private renderManager: IRendererManager) {
    super();
  }

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { elementId, x, y, relative = false } = command.parameters;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing required parameter: elementId'
        };
      }

      if (x === undefined && y === undefined) {
        return {
          success: false,
          error: 'At least one of x or y coordinates must be provided'
        };
      }

      // 通过 DOM API 获取元素
      const element = document.getElementById(elementId) as HTMLElement;
      
      if (!element) {
        return {
          success: false,
          error: `Element with id '${elementId}' not found`
        };
      }

      // 获取当前位置
      const currentStyle = window.getComputedStyle(element);
      const currentX = parseFloat(currentStyle.left) || 0;
      const currentY = parseFloat(currentStyle.top) || 0;

      // 计算新位置
      let newX = currentX;
      let newY = currentY;

      if (x !== undefined) {
        newX = relative ? currentX + x : x;
      }

      if (y !== undefined) {
        newY = relative ? currentY + y : y;
      }

      // 设置新位置
      element.style.position = element.style.position || 'absolute';
      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;

      // 记录位置变化到元素的 dataset
      element.dataset.positionX = newX.toString();
      element.dataset.positionY = newY.toString();

      context.logger?.info(`Element ${elementId} position set to (${newX}, ${newY})`);

      return {
        success: true,
        data: { 
          elementId, 
          x: newX, 
          y: newY, 
          relative,
          previousX: currentX,
          previousY: currentY
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set position: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 验证指令参数
   */
  validateParameters(parameters: any): boolean {
    if (!parameters.elementId || typeof parameters.elementId !== 'string') {
      return false;
    }

    if (parameters.x !== undefined && typeof parameters.x !== 'number') {
      return false;
    }

    if (parameters.y !== undefined && typeof parameters.y !== 'number') {
      return false;
    }

    if (parameters.relative !== undefined && typeof parameters.relative !== 'boolean') {
      return false;
    }

    return true;
  }
}