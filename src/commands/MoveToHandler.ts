import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 移动动画指令处理器
 * 处理元素的位置移动动画
 */
export class MoveToHandler extends BaseCommandHandler {
  readonly type = CommandType.MOVE_TO;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, x, y, duration, easing, relative } = command.parameters;
    
    if (!elementId) {
      return this.createErrorResult('Missing required parameter: elementId');
    }
    
    if (x === undefined && y === undefined) {
      return this.createErrorResult('At least one of x or y coordinates must be specified');
    }

    try {
      // 通过渲染管理器获取动画适配器
      const renderManager = context.renderManager;
      if (!renderManager) {
        return this.createErrorResult('Render manager not available');
      }
      
      // 注意：这里需要扩展渲染管理器接口来支持动画
      const animationAdapter = (renderManager as any).animationAdapter;
      if (!animationAdapter) {
        return this.createErrorResult('Animation adapter not available');
      }

      // 获取目标元素
      const element = (renderManager as any).getElement(elementId);
      if (!element) {
        return this.createErrorResult(`Element not found: ${elementId}`);
      }

      // 计算目标位置
      const currentX = element.x || 0;
      const currentY = element.y || 0;
      
      const targetX = relative ? currentX + (x || 0) : (x !== undefined ? x : currentX);
      const targetY = relative ? currentY + (y || 0) : (y !== undefined ? y : currentY);
      
      // 设置动画参数
      const animationConfig = {
        elementId,
        from: { x: currentX, y: currentY },
        to: { x: targetX, y: targetY },
        duration: duration || 1000, // 默认1秒
        easing: easing || 'ease-out',
        onUpdate: (progress: number, currentPos: { x: number; y: number }) => {
          // 更新元素位置
          element.x = currentPos.x;
          element.y = currentPos.y;
          
          // 触发渲染更新
          renderManager.render?.();
        },
        onComplete: () => {
          context.logger.debug(`Move animation completed for element: ${elementId}`);
        }
      };

      // 执行移动动画
      const animationId = await animationAdapter.moveTo(animationConfig);
      
      context.logger.debug(`Move animation started for element: ${elementId} to (${targetX}, ${targetY})`);
      
      return this.createSuccessResult({ 
        elementId,
        animationId,
        from: { x: currentX, y: currentY },
        to: { x: targetX, y: targetY },
        duration: animationConfig.duration,
        easing: animationConfig.easing
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to execute move animation: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['elementId'];
  }
}