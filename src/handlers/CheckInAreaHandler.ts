import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult, IRendererManager } from '../types';

/**
 * 检测元素是否在指定区域内的指令处理器
 */
export class CheckInAreaHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_IN_AREA;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    try {
      const { area, commands, checkMode = 'center' } = command.parameters || {};
      const stateManager = context.stateManager as any;
      // 仅根据 parameters.elementId 判断监听模式；不再从状态变量回退解析
      let elementId: string | undefined = command.parameters?.elementId;

      if (!elementId) {
        return {
          success: false,
          error: 'Missing elementId and last_drop_element_ID'
        };
      }

      if (!area) {
        return {
          success: false,
          error: 'Missing required parameter: area'
        };
      }

      // 验证区域参数（仅支持 x/y/width/height）
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
      
      const ax = Number(area.x);
      const ay = Number(area.y);
      const aw = Number(area.width);
      const ah = Number(area.height);

      // 以元素中心点检测是否在区域内
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const isInArea = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);

      // 命中时设置系统变量，并执行子命令
      if (isInArea) {
        try {
          const resourceId = (element.dataset && (element.dataset.resourceId || element.dataset.resourceID)) || '';
          context.stateManager.setVariable('last_drop_element_ID', elementId);
          context.stateManager.setVariable('last_drop_resource_ID', resourceId || '');
        } catch {}
        const exec: any = (context as any).executor;
        if (Array.isArray(commands) && commands.length) {
          await exec.executeCommands(commands);
        }
      }

      const resultData = {
        elementId,
        isInArea,
        checkMode,
        area,
        center: { x: cx, y: cy }
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
    if (!parameters || !this.validateArea(parameters.area)) {
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
