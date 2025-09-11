import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';

export class SetClickableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_CLICKABLE;//'set_clickable';

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const id: string = p.elementId;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    if (node.__clickHandler) {
      try { node.off?.('pointertap', node.__clickHandler); } catch {}
      node.__clickHandler = null;
    }

    const clickable = p.clickable !== false;
    if (!clickable) {
      node.eventMode = 'auto';
      node.cursor = 'default';
      return this.createSuccessResult({ elementId: id, clickable: false });
    }

    node.eventMode = 'static';
    node.cursor = 'pointer';
    const action: 'flip'|'toggle_selected'|'commands' = p.onClick || 'commands';
    const backResourceId: string | undefined = p.backResourceId;
    const showBackParam: boolean | undefined = p.showBack;
    const commands: GameCommand[] = Array.isArray(p.commands) ? p.commands : [];

    const handler = () => {
      if (action === 'flip') {
        const showBack: boolean = (typeof showBackParam === 'boolean') ? showBackParam : !(node.__isBack === true);
        context.executor.executeCommand({ id: `flip_${id}_${Date.now()}` as any, type: 'flip_card' as any, parameters: { elementId: id, backResourceId, showBack } } as any);
      } else if (action === 'toggle_selected') {
        const next = !(node.__selected === true);
        node.__selected = next;
        context.executor.executeCommand({ id: `sel_${id}_${Date.now()}` as any, type: 'set_selected' as any, parameters: { elementId: id, selected: next, effect: p.effect || 'pulse' } } as any);
      } else if (action === 'commands' && commands.length) {
        context.executor.executeCommands(commands);
      }
    };

    node.on?.('pointertap', handler);
    node.__clickHandler = handler;
    return this.createSuccessResult({ elementId: id, clickable: true, onClick: action });
  }
}
