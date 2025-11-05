import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveElementId } from '../utils/ParamResolver';

export class PixiCheckInAreaHandler extends BaseCommandHandler {
  readonly type = CommandType.CHECK_IN_AREA;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const outside = !!p.outside;
    const state: any = (context as any).stateManager;
    // 仅根据 parameters.elementId 判断监听模式；不再从状态变量回退解析
    let id: string | undefined = resolveElementId(p.elementId, context);
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
          const requireEnter = !!p.requireEnter; // 对 inside/outside 均生效
          const startedInside = new Map<string, boolean>();
          if (on && exec && Array.isArray(p.commands)) {
            // 防止跨关卡或重复注册导致的多次响应：先清掉同名监听
            try { em?.removeAllListeners?.(zoneId); } catch {}
            // 记录拖拽开始时是否在区域内（供 requireEnter 与 outside 模式共用）
            if (requireEnter) {
              try { em?.removeAllListeners?.(`${zoneId}_drag_start_guard`); } catch {}
              const onDragStart = (payload: any) => {
                try {
                  const eid = payload?.elementId;
                  if (!eid) return;
                  const n = rm?.getNode ? rm.getNode(eid) : null;
                  if (!n) return;
                  const b = n.getBounds ? n.getBounds() : { x: n.x || 0, y: n.y || 0, width: n.width || 0, height: n.height || 0 };
                  const cx = b.x + (b.width || 0) / 2;
                  const cy = b.y + (b.height || 0) / 2;
                  const inside = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
                  startedInside.set(eid, inside);
                } catch {}
              };
              try { (onDragStart as any).__handlerId = `${zoneId}_drag_start_guard`; } catch {}
              em?.on?.('drag_start', onDragStart as any);
            }
            // inside 模式：订阅进入区域事件
            if (!outside) {
              on(zoneId, async (payload: any) => {
                try {
                  // 进入区域命中；若 requireEnter=true 且拖拽前已在区域内，则忽略
                  if (requireEnter) {
                    const eid = payload?.draggedElementId || payload?.elementId;
                    if (eid && startedInside.get(eid) === true) {
                      if (triggerMode === 'once') {
                        try { em?.removeAllListeners?.(zoneId); } catch {}
                      }
                      return;
                    }
                  }
                  await exec.executeCommands(p.commands);
                } catch {}
              });
            }
            // outside 模式：拖拽结束时，如果中心点在区域外则触发；requireEnter=true 则要求起始在区域内
            if (outside) {
              const dragHandlerId = `${zoneId}_drag_end_outside`;
              try { em?.removeAllListeners?.(dragHandlerId); } catch {}
              const checkOutside = async (payload: any) => {
                try {
                  const eid = payload?.elementId;
                  if (!eid) return;
                  const n = rm?.getNode ? rm.getNode(eid) : null;
                  if (!n) return;
                  const b = n.getBounds ? n.getBounds() : { x: n.x || 0, y: n.y || 0, width: n.width || 0, height: n.height || 0 };
                  const cx = b.x + (b.width || 0) / 2;
                  const cy = b.y + (b.height || 0) / 2;
                  const inside = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
                  const startedInComplement = requireEnter ? (startedInside.get(eid) === true) : true; // outside 模式：要求起始在区域内
                  if (!inside && startedInComplement) {
                    try {
                      state?.setVariable?.('last_drop_element_ID', eid);
                      const resId = (n as any).resourceId || '';
                      state?.setVariable?.('last_drop_resource_ID', resId || '');
                    } catch {}
                    await exec.executeCommands(p.commands);
                    if (triggerMode === 'once') {
                      try { em?.off?.('drag_end', checkOutside as any); } catch {}
                    }
                  }
                } catch {}
              };
              // 使用自定义事件名桥接一次性移除（通过 removeAllListeners 保护）
              try { (checkOutside as any).__handlerId = dragHandlerId; } catch {}
              const listen = triggerMode === 'once' ? em?.once?.bind(em) : em?.on?.bind(em);
              listen && listen('drag_end', checkOutside);
            }
          }
          return this.createSuccessResult({ subscribed: true, mode: 'zone', zoneId, triggerMode, outside: !!outside, area: { x: ax, y: ay, width: aw, height: ah } });
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
          const requireEnter = !!p.requireEnter;
          const startedInside = new Map<string, boolean>();
          if (on && exec && Array.isArray(p.commands)) {
            try { em?.removeAllListeners?.(zoneId); } catch {}
            if (requireEnter) {
              try { em?.removeAllListeners?.(`${zoneId}_drag_start_guard`); } catch {}
              const onDragStart = (payload: any) => {
                try {
                  const eid = payload?.elementId;
                  if (!eid) return;
                  const n = rm?.getNode ? rm.getNode(eid) : null;
                  if (!n) return;
                  const b = n.getBounds ? n.getBounds() : { x: n.x || 0, y: n.y || 0, width: n.width || 0, height: n.height || 0 };
                  const cx = b.x + (b.width || 0) / 2;
                  const cy = b.y + (b.height || 0) / 2;
                  const inside = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
                  startedInside.set(eid, inside);
                } catch {}
              };
              try { (onDragStart as any).__handlerId = `${zoneId}_drag_start_guard`; } catch {}
              em?.on?.('drag_start', onDragStart as any);
            }
            if (!outside) {
              on(zoneId, async (payload: any) => {
                try {
                  if (requireEnter) {
                    const eid = payload?.draggedElementId || payload?.elementId;
                    if (eid && startedInside.get(eid) === true) {
                      if (triggerMode === 'once') {
                        try { em?.removeAllListeners?.(zoneId); } catch {}
                      }
                      return;
                    }
                  }
                  await exec.executeCommands(p.commands);
                } catch {}
              });
            }
            if (outside) {
              const dragHandlerId = `${zoneId}_drag_end_outside`;
              try { em?.removeAllListeners?.(dragHandlerId); } catch {}
              const checkOutside = async (payload: any) => {
                try {
                  const eid = payload?.elementId;
                  if (!eid) return;
                  const n = rm?.getNode ? rm.getNode(eid) : null;
                  if (!n) return;
                  const b = n.getBounds ? n.getBounds() : { x: n.x || 0, y: n.y || 0, width: n.width || 0, height: n.height || 0 };
                  const cx = b.x + (b.width || 0) / 2;
                  const cy = b.y + (b.height || 0) / 2;
                  const inside = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
                  const startedInComplement = requireEnter ? (startedInside.get(eid) === true) : true;
                  if (!inside && startedInComplement) {
                    try {
                      state?.setVariable?.('last_drop_element_ID', eid);
                      const resId = (n as any).resourceId || '';
                      state?.setVariable?.('last_drop_resource_ID', resId || '');
                    } catch {}
                    await exec.executeCommands(p.commands);
                    if (triggerMode === 'once') {
                      try { em?.off?.('drag_end', checkOutside as any); } catch {}
                    }
                  }
                } catch {}
              };
              try { (checkOutside as any).__handlerId = dragHandlerId; } catch {}
              const listen = triggerMode === 'once' ? em?.once?.bind(em) : em?.on?.bind(em);
              listen && listen('drag_end', checkOutside);
            }
          }
          return this.createSuccessResult({ subscribed: true, mode: 'zone', zoneId, triggerMode, outside: !!outside, area: { x: ax, y: ay, width: aw, height: ah } });
        }
      } catch {}
      return this.createErrorResult(`Element not found and zone fallback failed: ${id}`);
    }

    // Create/update a watcher bound to app.ticker; non-blocking, subscription-like
    const watcherId = `chk_${command.id || (Date.now() + '_' + Math.random().toString(36).slice(2,6))}`;
    const ax = ax0, ay = ay0, aw = aw0, ah = ah0;
    const requireEnter = !!p.requireEnter;
    let fired = false;
    const exec = (context as any).executor;
    // Ensure holder
    if (!node.__checkAreaWatchers) node.__checkAreaWatchers = new Map<string, any>();
    // Cleanup same id watcher
    try {
      const prev = node.__checkAreaWatchers.get(watcherId);
      if (prev) { app.ticker.remove(prev.fn); node.__checkAreaWatchers.delete(watcherId); }
    } catch {}

    let startedInside = false;
    let boundStartHandler: any = null;
    if (requireEnter) {
      try {
        const em = (context as any).eventManager;
        const onStart = (payload: any) => {
          try {
            if (!payload || payload.elementId !== id) return;
            const b = node.getBounds ? node.getBounds() : { x: node.x || 0, y: node.y || 0, width: node.width || 0, height: node.height || 0 };
            const cx = b.x + (b.width || 0) / 2;
            const cy = b.y + (b.height || 0) / 2;
            startedInside = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
          } catch { startedInside = false; }
        };
        boundStartHandler = onStart;
        em?.on?.('drag_start', onStart as any);
      } catch {}
    }

    const fn = () => {
      try {
        const b = node.getBounds ? node.getBounds() : { x: node.x || 0, y: node.y || 0, width: node.width || 0, height: node.height || 0 };
        const cx = b.x + (b.width || 0) / 2;
        const cy = b.y + (b.height || 0) / 2;
        // only evaluate when not dragging
        if ((node as any).__dragging) return;
        let hit = (cx >= ax && cx <= ax + aw && cy >= ay && cy <= ay + ah);
        if (outside) hit = !hit;
        if (hit && !fired) {
          if (requireEnter) {
            const startedInComplement = outside ? startedInside : !startedInside;
            if (!startedInComplement) return; // not a boundary enter into target space
          }
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
          // cleanup start listener
          try { if (boundStartHandler) (context as any).eventManager?.off?.('drag_start', boundStartHandler as any); } catch {}
        }
      } catch {}
    };
    app.ticker.add(fn);
    node.__checkAreaWatchers.set(watcherId, { fn, area: { x: ax, y: ay, width: aw, height: ah }, outside: !!outside, requireEnter: !!requireEnter });
    return this.createSuccessResult({ elementId: id, subscribed: true, outside: !!outside, requireEnter: !!requireEnter, area: { x: ax, y: ay, width: aw, height: ah } });
  }
}
