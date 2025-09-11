import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示文本指令处理器
 */
export class ShowTextHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_TEXT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const text: string = p.text;
    // 兼容V2：position.{x,y} 与 elementId
    const pos = p.position || {};
    const x: number = p.x ?? pos.x ?? 0;
    const y: number = p.y ?? pos.y ?? 0;
    const style = p.style || {};
    if (style.zIndex === undefined) {
      style.zIndex = 5; // 默认高于背景，低于标题
    }
    const elementId = p.elementId || p.id || `text_${Date.now()}`;
    
    if (!text) {
      return this.createErrorResult('Missing required parameter: text');
    }

    try {
      const elementConfig: ElementConfig = {
        id: elementId,
        type: 'text',
        position: { x, y },
        content: text,
        style,
        visible: true
      };

      const element = context.renderManager.createElement(elementConfig);
      
      context.logger.debug(`Text displayed: ${text} at (${x}, ${y})`);
      // 支持阻塞模式：等待点击继续
      const blocking: boolean = !!p.blocking || !!p.waitForClick;
      // 默认阻塞文本点击后移除（可通过 dismissOnContinue:false 关闭）
      const dismissOnContinue: boolean = p.dismissOnContinue === false ? false : (!!p.blocking || !!p.waitForClick);
      if (blocking) {
        context.eventManager.emit('text_displayed', { elementId, blocking: true, dismissOnContinue });
        await new Promise<void>((resolve) => {
          const once = (payload?: any) => {
            if (!payload || payload.elementId === elementId) resolve();
          };
          context.eventManager.once('text_continue', once);
        });
        if (dismissOnContinue && (context.renderManager as any)?.removeElement) {
          try { (context.renderManager as any).removeElement(elementId); } catch {}
        }
      } else {
        context.eventManager.emit('text_displayed', { elementId, blocking: false, dismissOnContinue: false });
      }
      
      return this.createSuccessResult({ elementId, text, position: { x, y } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to show text: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['text'];
  }
}
