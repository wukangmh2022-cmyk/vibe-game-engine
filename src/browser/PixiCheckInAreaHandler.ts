import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveIdFromBraces } from '../utils/ParamResolver';

export class PixiCheckInAreaHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_IN_AREA;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const state: any = (context as any).stateManager;
    // 仅根据 parameters.elementId 判断监听模式；不再从状态变量回退解析
    let id: string | undefined = resolveIdFromBraces(p.elementId, context);
    const area = p.area || {};
    // 仅支持 XYWH（简化）
    const ax0 = Number(area.x) || 0;
    const ay0 = Number(area.y) || 0;
    const aw0 = Number(area.width) || 0;
    const ah0 = Number(area.height) || 0;
    const rm: any = context.renderManager as any;
    const app = rm?.getApp ? rm.getApp() : rm?.app;
    if (!app) return this.createErrorResult('Renderer app missing');

    // 如果未提供 elementId（且状态中也没有），则作为“任意元素”监听：
    // 注册一个投放区，命中时执行子命令。
    // 默认允许多次触发；可通过 parameters.triggerMode === 'once' 改为一次性。
    if (!id) {
      try {
        const ax = ax0, ay = ay0, aw = aw0, ah = ah0;
        const zoneId = `chk_area_${command.id || (Date.now() + '_' + Math.random().toString(36).slice(2,6))}`;
        if (typeof rm?.addDropZone === 'function') {
          rm.addDropZone(zoneId, { x: ax, y: ay, w: aw, h: ah });
          // 监听该投放区事件，由 SetDraggable 在命中时触发
          const em = (context as any).eventManager;
          const triggerMode = (p.triggerMode === 'once') ? 'once' : 'multiple';
          const on = triggerMode === 'once' ? em?.once?.bind(em) : em?.on?.bind(em);
          const exec = (context as any).executor;
          if (on && exec && Array.isArray(p.commands)) {
            // 防止跨关卡或重复注册导致的多次响应：先清掉同名监听
            try { em?.removeAllListeners?.(zoneId); } catch {}
            on(zoneId, async () => {
              try {
                // 命中时执行子命令
                await exec.executeCommands(p.commands);
              } catch {}
            });
          }
          return this.createSuccessResult({ subscribed: true, mode: 'zone', zoneId, triggerMode, area: { x: ax, y: ay, width: aw, height: ah } });
        }
      } catch {}
      return this.createErrorResult('Missing elementId and renderer does not support global zone check');
    }

    // 若通过状态解析出了 id，但当前找不到对应节点（例如跨关卡遗留的 last_drop_element_ID），
    // 则退回到“全局投放区”模式，避免监听缺失。
    let node = rm?.getNode ? rm.getNode(id) : null;
    if (!node) {
      try {
        const ax = ax0, ay = ay0, aw = aw0, ah = ah0;
        const zoneId = `chk_area_${command.id || (Date.now() + '_' + Math.random().toString(36).slice(2,6))}`;
        if (typeof rm?.addDropZone === 'function') {
          rm.addDropZone(zoneId, { x: ax, y: ay, w: aw, h: ah });
          const em = (context as any).eventManager;
          const triggerMode = (p.triggerMode === 'once') ? 'once' : 'multiple';
          const on = triggerMode === 'once' ? em?.once?.bind(em) : em?.on?.bind(em);
          const exec = (context as any).executor;
          if (on && exec && Array.isArray(p.commands)) {
            try { em?.removeAllListeners?.(zoneId); } catch {}
            on(zoneId, async () => {
              try { await exec.executeCommands(p.commands); } catch {}
            });
          }
          return this.createSuccessResult({ subscribed: true, mode: 'zone', zoneId, triggerMode, area: { x: ax, y: ay, width: aw, height: ah } });
        }
      } catch {}
      return this.createErrorResult(`Element not found and zone fallback failed: ${id}`);
    }

    // Create/update a watcher bound to app.ticker; non-blocking, subscription-like
    const watcherId = `chk_${command.id || (Date.now() + '_' + Math.random().toString(36).slice(2,6))}`;
    const ax = ax0, ay = ay0, aw = aw0, ah = ah0;
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
