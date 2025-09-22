import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

export class PixiCheckInAreaHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_IN_AREA;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const state: any = (context as any).stateManager;
    let id: string | undefined = p.elementId;
    if ((!id || typeof id !== 'string') && state?.getVariable) {
      try {
        const fromState = state.getVariable('last_drop_element_ID');
        if (typeof fromState === 'string' && fromState) id = fromState;
      } catch {}
    }
    const area = p.area || {};
    if (!id) return this.createErrorResult('Missing elementId and last_drop_element_ID');
    const rm: any = context.renderManager as any;
    const app = rm?.getApp ? rm.getApp() : rm?.app;
    const node = rm?.getNode ? rm.getNode(id) : null;
    if (!node || !app) return this.createErrorResult(`Element not found or app missing: ${id}`);

    // Create/update a watcher bound to app.ticker; non-blocking, subscription-like
    const watcherId = `chk_${command.id || (Date.now() + '_' + Math.random().toString(36).slice(2,6))}`;
    const ax = Number(area.x) || 0, ay = Number(area.y) || 0, aw = Number(area.width) || 0, ah = Number(area.height) || 0;
    let fired = false;
    const exec = (context as any).executor;
    // Ensure holder
    if (!node.__checkAreaWatchers) node.__checkAreaWatchers = new Map<string, any>();
    // Cleanup same id watcher
    try {
      const prev = node.__checkAreaWatchers.get(watcherId);
      if (prev) { app.ticker.remove(prev.fn); node.__checkAreaWatchers.delete(watcherId); }
    } catch {}

    const fn = () => {
      try {
        const b = node.getBounds ? node.getBounds() : { x: node.x || 0, y: node.y || 0, width: node.width || 0, height: node.height || 0 };
        const cx = b.x + (b.width || 0) / 2;
        const cy = b.y + (b.height || 0) / 2;
        // only evaluate when not dragging
        if ((node as any).__dragging) return;
        const hit = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
        if (hit && !fired) {
          fired = true;
        try {
          state?.setVariable?.('last_drop_element_ID', id);
          const resId = (node as any).resourceId || '';
          state?.setVariable?.('last_drop_resource_ID', resId || '');
        } catch {}
          if (Array.isArray(p.commands) && p.commands.length) {
            // fire-and-forget; don't block ticker
            Promise.resolve(exec.executeCommands(p.commands)).catch(() => {});
          }
          // One-shot: remove watcher after fire
          app.ticker.remove(fn);
          node.__checkAreaWatchers.delete(watcherId);
        }
      } catch {}
    };
    app.ticker.add(fn);
    node.__checkAreaWatchers.set(watcherId, { fn, area: { x: ax, y: ay, width: aw, height: ah } });
    return this.createSuccessResult({ elementId: id, subscribed: true, area: { x: ax, y: ay, width: aw, height: ah } });
  }
}
