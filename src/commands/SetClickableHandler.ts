import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveIdFromBraces } from '../utils/ParamResolver';

export class SetClickableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_CLICKABLE;//'set_clickable';

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    let id: string | undefined = resolveIdFromBraces(p.elementId, context);
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    if (node.__clickHandler) {
      try { node.off?.('pointertap', node.__clickHandler); } catch {}
      node.__clickHandler = null;
    }

    const clickable = p.clickable !== false;
    const blocking: boolean = !!p.blocking;
    if (!clickable) {
      node.eventMode = 'auto';
      node.cursor = 'default';
      if (blocking) { try { rm.clearExclusiveInteractive(id); } catch {} }
      return this.createSuccessResult({ elementId: id, clickable: false, blocking });
    }

    node.eventMode = 'static';
    node.cursor = 'pointer';
    const action: 'flip'|'toggle_selected'|'commands' = p.onClick || 'commands';
    const backResourceId: string | undefined = p.backResourceId;
    const frontResourceId: string | undefined = p.frontResourceId;
    const showBackParam: boolean | undefined = p.showBack;
    const commands: GameCommand[] = Array.isArray(p.commands) ? p.commands : [];

    // For blocking=true, block the flow until the FIRST click completes
    let resolver: (() => void) | null = null;
    const waitFirstClick = blocking ? new Promise<void>(resolve => { resolver = resolve; }) : null;

    const handler = async () => {
      // Apply exclusive interaction only during the click handling window
      if (blocking && rm?.setExclusiveInteractive) {
        try { rm.setExclusiveInteractive(id); } catch {}
      }
      if (action === 'flip') {
        // 未明确指定时，基于当前面进行切换；首次默认视为背面在显示
        const isBackNow = (typeof (node as any).__isBack === 'boolean') ? (node as any).__isBack : true;
        const showBack: boolean = (typeof showBackParam === 'boolean') ? showBackParam : !isBackNow;
        await context.executor.executeCommand({ id: `flip_${id}_${Date.now()}` as any, type: 'flip_card' as any, parameters: { elementId: id, backResourceId, frontResourceId, showBack } } as any);
      } else if (action === 'toggle_selected') {
        const next = !(node.__selected === true);
        node.__selected = next;
        await context.executor.executeCommand({ id: `sel_${id}_${Date.now()}` as any, type: 'set_selected' as any, parameters: { elementId: id, selected: next, effect: p.effect || 'pulse' } } as any);
      } else if (action === 'commands' && commands.length) {
        await context.executor.executeCommands(commands);
      }
      // When blocking, release exclusive interaction after sub-commands complete
      if (blocking && rm?.clearExclusiveInteractive) {
        try { rm.clearExclusiveInteractive(id); } catch {}
      }
      if (resolver) { const r = resolver; resolver = null; try { r(); } catch {} }
    };

    node.on?.('pointertap', handler);
    node.__clickHandler = handler;
    if (waitFirstClick) {
      await waitFirstClick;
    }
    return this.createSuccessResult({ elementId: id, clickable: true, onClick: action, blocking });
  }
}
