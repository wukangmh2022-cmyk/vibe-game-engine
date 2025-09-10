import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class ShowImageHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_IMAGE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { src, x = 0, y = 0, width, height, id } = command.parameters;
    
    if (!src) {
      return this.createErrorResult('Missing required parameter: src');
    }

    try {
      const elementId = id || `image_${Date.now()}`;
      
      const elementConfig: ElementConfig = {
        id: elementId,
        type: 'image',
        position: { x, y },
        src,
        visible: true
      };

      if (width && height) {
        elementConfig.size = { width, height };
      }

      const element = context.renderManager.createElement(elementConfig);
      
      return this.createSuccessResult({ elementId, src, position: { x, y } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to show image: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['src'];
  }
}