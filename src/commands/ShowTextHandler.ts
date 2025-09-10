import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示文本指令处理器
 */
export class ShowTextHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_TEXT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { text, x = 0, y = 0, id, style = {} } = command.parameters;
    
    if (!text) {
      return this.createErrorResult('Missing required parameter: text');
    }

    try {
      const elementId = id || `text_${Date.now()}`;
      
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
      
      return this.createSuccessResult({ 
        elementId,
        text,
        position: { x, y }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to show text: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['text'];
  }
}