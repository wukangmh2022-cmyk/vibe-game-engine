import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class UpdateTextHandler extends BaseCommandHandler {
  readonly type = CommandType.UPDATE_TEXT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const elementId: string = p.elementId || p.id;
    if (!elementId) return this.createErrorResult('Missing required parameter: elementId');

    const pos = p.position || {};
    const x: number | undefined = p.x ?? pos.x;
    const y: number | undefined = p.y ?? pos.y;
    const style = p.style || undefined;
    const text: string | undefined = typeof p.text === 'string' ? this.interpolate(p.text, context) : undefined;

    if (text !== undefined) {
      (context.renderManager as any).updateElement(elementId, { type: 'text', content: text } as Partial<ElementConfig>);
    }
    if (x !== undefined || y !== undefined) {
      (context.renderManager as any).updateElement(elementId, { position: { x: x ?? 0, y: y ?? 0 } } as Partial<ElementConfig>);
    }
    if (style) {
      (context.renderManager as any).updateElement(elementId, { style } as Partial<ElementConfig>);
    }

    return this.createSuccessResult({ elementId, text, position: (x!==undefined||y!==undefined) ? { x: x ?? 0, y: y ?? 0 } : undefined });
  }

  private interpolate(text: string, context: CommandContext): string {
    const sm = (context as any).stateManager;
    return text.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
      const path = String(expr).trim();
      let key = path.startsWith('gameState.') ? path.slice('gameState.'.length) : path;
      const parts = key.split('.');
      let val: any = sm.getVariable(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        val = val != null ? val[parts[i]] : undefined;
      }
      return val != null ? String(val) : '';
    });
  }

  protected getRequiredParameters(): string[] { return ['elementId']; }
}

