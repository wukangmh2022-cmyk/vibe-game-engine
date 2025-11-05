import { BaseCommandHandler } from '../core/CommandExecutor';
import RemoteUser from '../core/RemoteUser';
import { CommandContext, CommandResult, GameCommand } from '../types';
import { ExpressionParser } from '../utils/ExpressionParser';

/**
 * 轻量脚本指令：仅做变量赋值（含随机/表达式）与元素属性更新，不调用其他指令
 * type: 'script'
 * parameters:
 *   - variables?: Record<string, any>
 *   - expressions?: Record<string, string>    // 使用 ${var} + 四则运算
 *   - random?: Record<string, { min: number; max: number; integer?: boolean }>
 *   - element?: { elementId: string; updates: Record<string, any> } // 可选：直接更新元素属性
 */
export class ScriptAssignHandler extends BaseCommandHandler {
  readonly type = 'script' as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    try {
      const sm: any = (context as any).stateManager;
      const rm: any = (context as any).renderManager;

      // 1) 随机数写变量
      if (p.random && typeof p.random === 'object') {
        for (const k of Object.keys(p.random)) {
          const spec = p.random[k] || {};
          const min = Number(spec.min ?? 0);
          const max = Number(spec.max ?? 1);
          const integer = !!spec.integer;
          const r = Math.random() * (max - min) + min;
          const v = integer ? Math.floor(r) : r;
          try { sm?.setVariable?.(k, v); } catch {}
        }
      }

      // 2) 直接赋值写变量
      if (p.variables && typeof p.variables === 'object') {
        for (const k of Object.keys(p.variables)) {
          try { sm?.setVariable?.(k, p.variables[k]); } catch {}
        }
      }

      // 3) 表达式求值写变量
      if (p.expressions && typeof p.expressions === 'object') {
        const parser = new ExpressionParser(sm);
        for (const k of Object.keys(p.expressions)) {
          const expr = String(p.expressions[k] ?? '');
          const val = parser.parse(expr);
          try { sm?.setVariable?.(k, val); } catch {}
        }
      }

      // 4) 可选：更新元素属性（如 position/scale/visible 等）
      if (p.element && typeof p.element === 'object') {
        const eid: string | undefined = p.element.elementId;
        const updates: Record<string, any> = p.element.updates || {};
        if (eid && updates && rm?.updateElement) {
          try { rm.updateElement(eid, updates as any); } catch {}
        }
      }

      // 5) 自由文本脚本（非命令）
      //    默认提供安全的受限 API；当 unsafe=true 时，提供更自由的上下文（仍建议在编辑器侧限制来源）。
      if (typeof p.code === 'string' && p.code.trim().length > 0) {
        const setVar = (k: string, v: any) => { try { sm?.setVariable?.(k, v); } catch {} };
        const setTempVar = (k: string, v: any) => { try { sm?.setTempVariable?.(k, v); } catch {} };
        const getVar = (k: string) => { try { return sm?.getVariable?.(k); } catch { return undefined; } };
        const rand = (min = 0, max = 1) => Math.random() * (max - min) + min;
        const randInt = (min: number, max: number) => Math.floor(rand(min, max));
        const updateElement = (elementId: string, updates: any) => { try { rm?.updateElement?.(elementId, updates); } catch {} };
        const getNode = (id: string) => { try { return rm?.getNode ? rm.getNode(id) : (rm?.getElement ? rm.getElement(id) : undefined); } catch { return undefined; } };
        const ex: any = (context as any).executor;
        const U = (RemoteUser as any)?.instance || RemoteUser;
        const wait = (ms: number) => new Promise<void>((resolve) => {
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          const id = setTimeout(done, Number(ms) || 0);
          if (ex && typeof ex.registerAbortable === 'function') {
            ex.registerAbortable(() => { clearTimeout(id); done(); });
          }
        });
        // 便捷元素操作集合
        const E = {
          get: (id: string) => getNode(id),
          exists: (id: string) => !!getNode(id),
          pos: (id: string) => { const n: any = getNode(id); return n ? { x: n.x ?? 0, y: n.y ?? 0 } : { x: 0, y: 0 }; },
          getPos: (id: string) => { const n: any = getNode(id); return n ? { x: n.x ?? 0, y: n.y ?? 0 } : undefined; },
          setPos: (id: string, x: number, y: number) => { updateElement(id, { position: { x, y } }); },
          moveBy: (id: string, dx: number, dy: number) => { const n: any = getNode(id); const x = (n?.x ?? 0) + (dx || 0); const y = (n?.y ?? 0) + (dy || 0); updateElement(id, { position: { x, y } }); },
          setVisible: (id: string, v: boolean) => { updateElement(id, { visible: !!v }); },
          setAlpha: (id: string, a: number) => { const n: any = getNode(id); if (n) { try { n.alpha = Number(a); } catch {} } },
          setScale: (id: string, sx: number, sy?: number) => { const x = Number(sx); const y = sy != null ? Number(sy) : x; updateElement(id, { scale: { x, y } as any }); },
          setZIndex: (id: string, z: number) => { const n: any = getNode(id); if (n) { try { (n as any).zIndex = Number(z); (n as any).parent?.sortChildren?.(); } catch {} } },
          // Getters
          getVisible: (id: string): boolean | undefined => { const n: any = getNode(id); return n ? !!n.visible : undefined; },
          getAlpha: (id: string): number | undefined => { const n: any = getNode(id); if (!n) return undefined; try { return typeof n.getRenderedAlpha === 'function' ? Number(n.getRenderedAlpha()) : Number(n.alpha ?? 1); } catch { return undefined; } },
          getScale: (id: string): { x: number; y: number } | undefined => { const n: any = getNode(id); if (!n) return undefined; try { if (typeof n.getRenderedScale === 'function') return n.getRenderedScale(); const s = (n as any).scale; return { x: Number(s?.x ?? 1), y: Number(s?.y ?? 1) }; } catch { return undefined; } },
          getZIndex: (id: string): number | undefined => { const n: any = getNode(id); return n != null ? Number((n as any).zIndex ?? 0) : undefined; },
          getRotation: (id: string): number | undefined => { const n: any = getNode(id); if (!n) return undefined; try { return typeof n.getRenderedRotation === 'function' ? Number(n.getRenderedRotation()) : Number(n.rotation ?? 0); } catch { return undefined; } },
          getSize: (id: string): { width: number; height: number } | undefined => { const n: any = getNode(id); if (!n) return undefined; try { const rt = typeof n.getRenderedTransform === 'function' ? n.getRenderedTransform() : undefined; return rt ? { width: Number(rt.width ?? 0), height: Number(rt.height ?? 0) } : undefined; } catch { return undefined; } },
          getResourceId: (id: string): string | undefined => { const n: any = getNode(id); if (!n) return undefined; try { const rid = (n as any).resourceId ?? (n as any).__content?.resourceId; return rid != null ? String(rid) : undefined; } catch { return undefined; } },
          // Returns the first child wrapper node (element) of given element id
          getFirstChild: (id: string) => {
            const p: any = getNode(id);
            const layer = p && (p as any).__animLayer;
            const arr: any[] | undefined = layer && Array.isArray((layer as any).children) ? (layer as any).children : undefined;
            if (!arr) return undefined;
            for (const ch of arr) { if (ch && (ch as any).__elementNode) return ch; }
            return undefined;
          },
          update: (id: string, updates: any) => updateElement(id, updates)
        };
        // 可选参数透传给脚本
        const args = p.args ?? {};
        try {
          if (p.unsafe === true) {
            // 更自由：暴露渲染管理器与便捷API给脚本上下文（异步包装，支持 await）
            const fn = new Function(
              'state','setVar','setTempVar','getVar','rand','randInt','wait','E','RM','args','console','RemoteUser','U',
              `return (async () => { ${String(p.code)} })();`
            );
            await Promise.resolve((fn as any)(sm, setVar, setTempVar, getVar, rand, randInt, wait, E, rm, args, console, RemoteUser, U));
          } else {
            // 默认：受限 API（异步包装，支持 await）
            const fn = new Function(
              'state','setVar','setTempVar','getVar','rand','randInt','wait','updateElement','args','RemoteUser','U',
              `return (async () => { ${String(p.code)} })();`
            );
            await Promise.resolve((fn as any)(sm, setVar, setTempVar, getVar, rand, randInt, wait, updateElement, args, RemoteUser, U));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return this.createErrorResult(`Script code error: ${msg}`);
        }
      }

      return this.createSuccessResult({ assigned: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.createErrorResult(`Script assign failed: ${msg}`);
    }
  }
}

export default ScriptAssignHandler;
