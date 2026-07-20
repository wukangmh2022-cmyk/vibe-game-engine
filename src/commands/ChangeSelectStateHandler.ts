import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveElementId } from '../utils/ParamResolver';

export class ChangeSelectStateHandler extends BaseCommandHandler {
  readonly type = CommandType.CHANGE_SELECTED_STATE as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const sm: any = (context as any).stateManager;
    const exec = (context as any).executor;
    const rm: any = (context as any).renderManager;

    let id: string | undefined = resolveElementId(p.elementId, context) || p.elementId;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const node: any = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const fnApply: ((tid: string, sel: boolean) => Promise<void>) | undefined = (node as any).__applySelectState;
    const fnToggle: (() => Promise<void>) | undefined = (node as any).__toggleSelectState;
    if (!fnApply && !fnToggle) {
      return this.createErrorResult('Element is not configured selectable. Execute SET_SELECTABLE first.');
    }

    if (typeof p.selected === 'boolean') {
      const current = ((node as any).__selected === true);
      if (current === !!p.selected) {
        // No change needed; avoid triggering flows
        return this.createSuccessResult({ elementId: id, selected: current, noChange: true });
      }
      await fnApply?.(id, !!p.selected);
      return this.createSuccessResult({ elementId: id, selected: !!p.selected });
    }
    await fnToggle?.();
    return this.createSuccessResult({ elementId: id, selected: !!((node as any).__selected === true) });
  }
}

export default ChangeSelectStateHandler;
