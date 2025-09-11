import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';

/**
 * 设置元素样式处理器
 * parameters: { elementId: string; style: Record<string, any> }
 * 兼容 V2 JSON 中的 "SET_ELEMENT_STYLE"
 */
export class SetElementStyleHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_ELEMENT_STYLE;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const { elementId, style } = command.parameters || {};
    if (!elementId || typeof elementId !== 'string') {
      return this.createErrorResult('Missing required parameter: elementId');
    }
    if (!style || typeof style !== 'object') {
      return this.createErrorResult('Missing required parameter: style');
    }

    try {
      const doc: any = (global as any).document || (globalThis as any).document;
      const el: any = doc?.getElementById ? doc.getElementById(elementId) : null;
      if (el && el.style && typeof el.style === 'object') {
        Object.assign(el.style, style);
      }
      context.logger?.info('Set element style', { elementId, style });
      return this.createSuccessResult({ elementId, style });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to set element style: ${msg}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['elementId', 'style'];
  }
}

