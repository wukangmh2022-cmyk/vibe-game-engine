import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult, IRendererManager } from '../types';

/**
 * 检测元素是否在指定区域内的指令处理器
 */
export class CheckInAreaHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_IN_AREA;

  constructor(private renderManager: IRendererManager) {
    super();
  }

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { 
        elementId, 
        area, 
        checkMode = 'center', 
        variableName,
        switchName 
      } = command.parameters;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing required parameter: elementId'
        };
      }

      if (!area) {
        return {
          success: false,
          error: 'Missing required parameter: area'
        };
      }

      // 验证区域参数
      if (!this.validateArea(area)) {
        return {
          success: false,
          error: 'Invalid area parameters. Area must have x, y, width, and height properties'
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

      // 获取元素的位置和尺寸
      const rect = element.getBoundingClientRect();
      
      // 根据检测模式确定检测点
      let checkPoints: { x: number; y: number }[];
      
      switch (checkMode) {
        case 'center':
          checkPoints = [{
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          }];
          break;
        case 'corners':
          checkPoints = [
            { x: rect.left, y: rect.top },
            { x: rect.right, y: rect.top },
            { x: rect.left, y: rect.bottom },
            { x: rect.right, y: rect.bottom }
          ];
          break;
        case 'edges':
          checkPoints = [
            { x: rect.left + rect.width / 2, y: rect.top },
            { x: rect.right, y: rect.top + rect.height / 2 },
            { x: rect.left + rect.width / 2, y: rect.bottom },
            { x: rect.left, y: rect.top + rect.height / 2 }
          ];
          break;
        case 'full':
          // 检查整个元素是否完全在区域内
          checkPoints = [
            { x: rect.left, y: rect.top },
            { x: rect.right, y: rect.bottom }
          ];
          break;
        default:
          checkPoints = [{
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          }];
      }

      // 执行区域检测
      let isInArea: boolean;
      
      if (checkMode === 'full') {
        // 检查整个元素是否完全在区域内
        isInArea = this.isRectInArea(rect, area);
      } else if (checkMode === 'corners' || checkMode === 'edges') {
        // 检查所有点是否都在区域内
        isInArea = checkPoints.every(point => this.isPointInArea(point, area));
      } else {
        // 检查任意一个点是否在区域内
        isInArea = checkPoints.some(point => this.isPointInArea(point, area));
      }

      // 存储结果到变量或开关
      if (variableName && context.stateManager) {
        context.stateManager.setVariable(variableName, isInArea);
        context.logger?.info(`Area check result stored in variable: ${variableName} = ${isInArea}`);
      }

      if (switchName && context.stateManager) {
        context.stateManager.setSwitch(switchName, isInArea);
        context.logger?.info(`Area check result stored in switch: ${switchName} = ${isInArea}`);
      }

      const resultData = {
        elementId,
        isInArea,
        checkMode,
        area,
        elementRect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        },
        checkPoints
      };

      context.logger?.info(`Area check for element ${elementId}: ${isInArea}`, resultData);

      return {
        success: true,
        data: resultData
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to check area: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 检查点是否在区域内
   */
  private isPointInArea(point: { x: number; y: number }, area: any): boolean {
    return point.x >= area.x && 
           point.x <= area.x + area.width &&
           point.y >= area.y && 
           point.y <= area.y + area.height;
  }

  /**
   * 检查矩形是否完全在区域内
   */
  private isRectInArea(rect: DOMRect, area: any): boolean {
    return rect.left >= area.x &&
           rect.top >= area.y &&
           rect.right <= area.x + area.width &&
           rect.bottom <= area.y + area.height;
  }

  /**
   * 验证区域参数
   */
  private validateArea(area: any): boolean {
    return area &&
           typeof area.x === 'number' &&
           typeof area.y === 'number' &&
           typeof area.width === 'number' &&
           typeof area.height === 'number' &&
           area.width > 0 &&
           area.height > 0;
  }

  /**
   * 验证指令参数
   */
  validateParameters(parameters: any): boolean {
    if (!parameters.elementId || typeof parameters.elementId !== 'string') {
      return false;
    }

    if (!this.validateArea(parameters.area)) {
      return false;
    }

    const validCheckModes = ['center', 'corners', 'edges', 'full'];
    if (parameters.checkMode && !validCheckModes.includes(parameters.checkMode)) {
      return false;
    }

    if (parameters.variableName !== undefined && typeof parameters.variableName !== 'string') {
      return false;
    }

    if (parameters.switchName !== undefined && typeof parameters.switchName !== 'string') {
      return false;
    }

    return true;
  }
}