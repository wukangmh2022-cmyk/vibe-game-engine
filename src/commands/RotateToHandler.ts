import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 旋转动画指令处理器
 * 处理元素的旋转动画
 */
export class RotateToHandler extends BaseCommandHandler {
  readonly type = CommandType.ROTATE_TO;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, rotation, duration, easing, relative, direction } = command.parameters;
    
    if (!elementId) {
      return this.createErrorResult('Missing required parameter: elementId');
    }
    
    if (rotation === undefined) {
      return this.createErrorResult('Missing required parameter: rotation');
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

      // 获取当前旋转角度（弧度）
      const currentRotation = element.rotation || 0;
      
      // 计算目标旋转角度
      let targetRotation: number;
      
      if (relative) {
        targetRotation = currentRotation + this.degreesToRadians(rotation);
      } else {
        targetRotation = this.degreesToRadians(rotation);
      }
      
      // 处理旋转方向优化
      if (direction === 'shortest') {
        // 选择最短路径旋转
        const diff = targetRotation - currentRotation;
        const normalizedDiff = ((diff % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        
        if (normalizedDiff > Math.PI) {
          targetRotation = currentRotation + normalizedDiff - (2 * Math.PI);
        } else {
          targetRotation = currentRotation + normalizedDiff;
        }
      } else if (direction === 'clockwise') {
        // 强制顺时针旋转
        while (targetRotation <= currentRotation) {
          targetRotation += 2 * Math.PI;
        }
      } else if (direction === 'counterclockwise') {
        // 强制逆时针旋转
        while (targetRotation >= currentRotation) {
          targetRotation -= 2 * Math.PI;
        }
      }
      
      // 设置动画参数
      const animationConfig = {
        elementId,
        from: { rotation: currentRotation },
        to: { rotation: targetRotation },
        duration: duration || 1000, // 默认1秒
        easing: easing || 'ease-out',
        onUpdate: (progress: number, currentRot: { rotation: number }) => {
          // 更新元素旋转
          element.rotation = currentRot.rotation;
          
          // 触发渲染更新
          renderManager.render?.();
        },
        onComplete: () => {
          context.logger.debug(`Rotation animation completed for element: ${elementId}`);
        }
      };

      // 执行旋转动画
      const animationId = await animationAdapter.rotateTo(animationConfig);
      
      const targetDegrees = this.radiansToDegrees(targetRotation);
      context.logger.debug(`Rotation animation started for element: ${elementId} to ${targetDegrees}°`);
      
      return this.createSuccessResult({ 
        elementId,
        animationId,
        from: { rotation: this.radiansToDegrees(currentRotation) },
        to: { rotation: targetDegrees },
        duration: animationConfig.duration,
        easing: animationConfig.easing,
        direction
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to execute rotation animation: ${errorMessage}`);
    }
  }

  /**
   * 将角度转换为弧度
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 将弧度转换为角度
   */
  private radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  protected getRequiredParameters(): string[] {
    return ['elementId', 'rotation'];
  }
}