import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveIdFromBraces, resolveNumberFromBraces } from '../utils/ParamResolver';

/**
 * 移动动画指令处理器
 * 处理元素的位置移动动画
 */
export class MoveToHandler extends BaseCommandHandler {
  readonly type = CommandType.MOVE_TO;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { x, y, duration, easing, relative, keepOnMinusOne = true } = command.parameters || {};
    const elementId = resolveIdFromBraces(command.parameters?.elementId, context);
    
    if (!elementId) {
      return this.createErrorResult('Missing required parameter: elementId');
    }
    
    // 支持：当 keepOnMinusOne 为真时，-1 表示“不修改”
    // Resolve x/y from {var}; keepOnMinusOne still respected on resolved numbers
    const rx = resolveNumberFromBraces(x, context);
    const ry = resolveNumberFromBraces(y, context);
    const xv = (rx != null ? rx : x);
    const yv = (ry != null ? ry : y);
    const nx = (keepOnMinusOne && xv === -1) ? undefined : xv;
    const ny = (keepOnMinusOne && yv === -1) ? undefined : yv;

    if (nx === undefined && ny === undefined) {
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
      const element = (renderManager as any).getElement ? (renderManager as any).getElement(elementId) : (renderManager as any).getNode?.(elementId);
      if (!element) {
        return this.createErrorResult(`Element not found: ${elementId}`);
      }

      // 计算目标位置
      const currentX = element.x || 0;
      const currentY = element.y || 0;
      
      const targetX = relative ? currentX + (nx ?? 0) : (nx !== undefined ? nx : currentX);
      const targetY = relative ? currentY + (ny ?? 0) : (ny !== undefined ? ny : currentY);
      
      // 设置动画参数
      const animationConfig = {
        elementId,
        from: { x: currentX, y: currentY },
        to: { x: targetX, y: targetY },
        duration: duration || 1000, // 默认1秒
        easing: easing || 'ease-out',
        onUpdate: (_progress: number, currentPos: { x: number; y: number }) => {
          try {
            (renderManager as any).updateElement?.(elementId, { position: { x: currentPos.x, y: currentPos.y } });
          } catch {
            element.x = currentPos.x;
            element.y = currentPos.y;
          }
        },
        onComplete: () => {
          context.logger.debug(`Move animation completed for element: ${elementId}`);
        }
      };

      // 执行移动动画
      const animationId = await (animationAdapter?.moveTo ? animationAdapter.moveTo(animationConfig) : (async () => {
        // 兜底：若未提供 animationAdapter.moveTo，则使用 requestAnimationFrame 简易实现
        return await new Promise<string>((resolve) => {
          const start = Date.now();
          const dur = Number(animationConfig.duration) || 1000;
          const id = `anim_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          const step = () => {
            const t = Math.min(1, (Date.now() - start) / dur);
            const cx = currentX + (targetX - currentX) * t;
            const cy = currentY + (targetY - currentY) * t;
            try { animationConfig.onUpdate?.(t, { x: cx, y: cy }); } catch {}
            if (t < 1) requestAnimationFrame(step); else { try { animationConfig.onComplete?.(); } catch {} resolve(id); }
          };
          requestAnimationFrame(step);
        });
      })());
      
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
