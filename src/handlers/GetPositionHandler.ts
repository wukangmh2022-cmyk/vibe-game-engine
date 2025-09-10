import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult, IRendererManager } from '../types';

/**
 * 获取元素位置的指令处理器
 */
export class GetPositionHandler extends BaseCommandHandler {
  readonly type = CommandType.GET_POSITION;

  constructor(private renderManager: IRendererManager) {
    super();
  }

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { elementId, variableName } = command.parameters;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing required parameter: elementId'
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

      // 获取元素的位置信息
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      
      // 获取相对于父元素的位置
      const offsetX = element.offsetLeft;
      const offsetY = element.offsetTop;
      
      // 获取样式中设置的位置
      const styleLeft = parseFloat(computedStyle.left) || 0;
      const styleTop = parseFloat(computedStyle.top) || 0;
      
      // 从 dataset 中获取记录的位置（如果有）
      const datasetX = element.dataset.positionX ? parseFloat(element.dataset.positionX) : null;
      const datasetY = element.dataset.positionY ? parseFloat(element.dataset.positionY) : null;

      const positionData = {
        elementId,
        // 相对于视口的位置
        viewport: {
          x: rect.left,
          y: rect.top,
          right: rect.right,
          bottom: rect.bottom
        },
        // 相对于父元素的位置
        offset: {
          x: offsetX,
          y: offsetY
        },
        // CSS 样式中的位置
        style: {
          x: styleLeft,
          y: styleTop
        },
        // 记录在 dataset 中的位置
        dataset: {
          x: datasetX,
          y: datasetY
        },
        // 元素尺寸
        size: {
          width: rect.width,
          height: rect.height
        }
      };

      // 如果指定了变量名，将位置信息存储到状态管理器中
      if (variableName && context.stateManager) {
        context.stateManager.setVariable(variableName, positionData);
        context.logger?.info(`Position data stored in variable: ${variableName}`);
      }

      context.logger?.info(`Retrieved position for element ${elementId}:`, positionData);

      return {
        success: true,
        data: positionData
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get position: ${error instanceof Error ? error.message : 'Unknown error'}`
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

    if (parameters.variableName !== undefined && typeof parameters.variableName !== 'string') {
      return false;
    }

    return true;
  }
}