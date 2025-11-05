import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveElementId } from '../utils/ParamResolver';

/**
 * 缩放动画指令处理器
 * 处理元素的缩放动画
 */
export class ScaleToHandler extends BaseCommandHandler {
  readonly type = CommandType.SCALE_TO;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { scaleX, scaleY, scale, duration, easing, relative } = command.parameters;
    const elementId = resolveElementId(command.parameters?.elementId, context);
    
    if (!elementId) {
      return this.createErrorResult('Missing required parameter: elementId');
    }
    
    // 处理缩放参数：可以使用统一的scale或分别设置scaleX/scaleY
    let targetScaleX: number;
    let targetScaleY: number;
    
    if (scale !== undefined) {
      targetScaleX = targetScaleY = scale;
    } else {
      if (scaleX === undefined && scaleY === undefined) {
        return this.createErrorResult('At least one of scale, scaleX, or scaleY must be specified');
      }
      targetScaleX = scaleX;
      targetScaleY = scaleY;
    }

    try {
      // 通过渲染管理器获取动画适配器
      const renderManager = context.renderManager;
      if (!renderManager) {
        return this.createErrorResult('Render manager not available');
      }
      
      const animationAdapter = (renderManager as any).animationAdapter;
      if (!animationAdapter) {
        return this.createErrorResult('Animation adapter not available');
      }

      // 获取目标元素
      const element = (renderManager as any).getElement(elementId);
      if (!element) {
        return this.createErrorResult(`Element not found: ${elementId}`);
      }

      // 获取当前缩放值
      const currentScaleX = element.scaleX || 1;
      const currentScaleY = element.scaleY || 1;
      
      // 计算目标缩放值
      const finalScaleX = relative 
        ? currentScaleX * (targetScaleX || 1)
        : (targetScaleX !== undefined ? targetScaleX : currentScaleX);
      const finalScaleY = relative 
        ? currentScaleY * (targetScaleY || 1)
        : (targetScaleY !== undefined ? targetScaleY : currentScaleY);
      
      // 设置动画参数
      const animationConfig = {
        elementId,
        from: { scaleX: currentScaleX, scaleY: currentScaleY },
        to: { scaleX: finalScaleX, scaleY: finalScaleY },
        duration: duration || 1000, // 默认1秒
        easing: easing || 'ease-out',
        onUpdate: (progress: number, currentScale: { scaleX: number; scaleY: number }) => {
          // 更新元素缩放
          element.scaleX = currentScale.scaleX;
          element.scaleY = currentScale.scaleY;
          
          // 触发渲染更新
          renderManager.render?.();
        },
        onComplete: () => {
          context.logger.debug(`Scale animation completed for element: ${elementId}`);
        }
      };

      // 执行缩放动画
      const animationId = await animationAdapter.scaleTo(animationConfig);
      
      context.logger.debug(`Scale animation started for element: ${elementId} to (${finalScaleX}, ${finalScaleY})`);
      
      return this.createSuccessResult({ 
        elementId,
        animationId,
        from: { scaleX: currentScaleX, scaleY: currentScaleY },
        to: { scaleX: finalScaleX, scaleY: finalScaleY },
        duration: animationConfig.duration,
        easing: animationConfig.easing
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to execute scale animation: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['elementId'];
  }
}
