import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveElementId, interpolateBraces } from '../utils/ParamResolver';

export class SetClickableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_CLICKABLE;//'set_clickable';

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    let id: string | undefined = resolveElementId(p.elementId, context);
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

    // 绑定点击时的“自元素ID”，将子指令中的占位 elementId (如 "{curIndex}") 冻结为当前元素ID，避免点击发生时被后续循环改写
    const freezeBraceId = (val: any): any => {
      if (typeof val === 'string' && /^\{[^}]+\}$/.test(val)) return id;
      return val;
    };
    const bindToSelf = (arr: GameCommand[]): GameCommand[] => {
      const sm: any = (context as any).stateManager;
      const isTempVar = (name: string): boolean => {
        try { return !!sm?.hasTemp?.(name); } catch { return false; }
      };
      const containsTempBrace = (s: string): boolean => {
        try {
          const re = /\{([^}]+)\}/g; let m: RegExpExecArray | null;
          while ((m = re.exec(s))) { if (isTempVar(String(m[1]).trim())) return true; }
          return false;
        } catch { return false; }
      };
      const deep = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(deep);
        if (obj && typeof obj === 'object') {
          const out: any = {};
          for (const k of Object.keys(obj)) {
            if (k === 'parameters' && obj[k] && typeof obj[k] === 'object') {
              const rawParams = obj[k];
              const p0: any = deep(rawParams);
              // elementId: 仅对“临时变量”做提前冻结/内插
              if (typeof rawParams.elementId === 'string') {
                const s = rawParams.elementId;
                const m = s.match(/^\{([^}]+)\}$/);
                if (m) {
                  // braces-only: freeze to self only when the var is temp
                  const varName = m[1].trim();
                  if (isTempVar(varName)) p0.elementId = id; // freeze to self
                  else p0.elementId = s; // keep for runtime resolution
                } else if (containsTempBrace(s)) {
                  // embedded braces containing any temp var → interpolate now
                  p0.elementId = interpolateBraces(s, context);
                } else {
                  p0.elementId = s; // keep as-is for runtime handlers to resolve
                }
              }
              // parentId: 同样逻辑
              if (typeof rawParams.parentId === 'string') {
                const s2 = rawParams.parentId;
                const m2 = s2.match(/^\{([^}]+)\}$/);
                if (m2) {
                  const varName2 = m2[1].trim();
                  if (isTempVar(varName2)) p0.parentId = id; else p0.parentId = s2;
                } else if (containsTempBrace(s2)) {
                  p0.parentId = interpolateBraces(s2, context);
                } else {
                  p0.parentId = s2;
                }
              }
              out[k] = p0;
            } else {
              out[k] = deep(obj[k]);
            }
          }
          return out;
        }
        return obj;
      };
      return deep(arr);
    };
    const boundCommands: GameCommand[] = bindToSelf(commands);

    // For blocking=true, block the flow until the FIRST click completes
    let resolver: (() => void) | null = null;
    const waitFirstClick = blocking ? new Promise<void>(resolve => { resolver = resolve; }) : null;

    const handler = async () => {
      // Apply exclusive interaction only during the click handling window
      if (blocking && rm?.setExclusiveInteractive) {
        try { rm.setExclusiveInteractive(id); } catch {}
      }
      try {
        // 记录系统变量：最近一次点击
        try {
          (context as any).stateManager?.setVariable?.('lastClickID', id);
          const resId = (node as any)?.resourceId || (node as any)?.__elementNode?.getBaseSnapshot?.()?.resourceId || '';
          (context as any).stateManager?.setVariable?.('lastClickResourceID', resId || '');
        } catch {}
        if (action === 'flip') {
          // 未明确指定时，基于当前面进行切换；首次默认视为背面在显示
          const isBackNow = (typeof (node as any).__isBack === 'boolean') ? (node as any).__isBack : true;
          const showBack: boolean = (typeof showBackParam === 'boolean') ? showBackParam : !isBackNow;
          await context.executor.executeCommand({ id: `flip_${id}_${Date.now()}` as any, type: 'flip_card' as any, parameters: { elementId: id, backResourceId, frontResourceId, showBack } } as any);
        } else if (action === 'toggle_selected') {
          const next = !(node.__selected === true);
          node.__selected = next;
          await context.executor.executeCommand({ id: `sel_${id}_${Date.now()}` as any, type: 'change_selected_state' as any, parameters: { elementId: id, selected: next } } as any);
        } else if (action === 'commands' && commands.length) {
          await context.executor.executeCommands(boundCommands);
        }
      } finally {
        // When blocking, release exclusive interaction after sub-commands complete
        if (blocking && rm?.clearExclusiveInteractive) {
          try { rm.clearExclusiveInteractive(id); } catch {}
        }
        if (resolver) { const r = resolver; resolver = null; try { r(); } catch {} }
      }
    };

    node.on?.('pointertap', handler);
    node.__clickHandler = handler;
    if (waitFirstClick) {
      await waitFirstClick;
    }
    return this.createSuccessResult({ elementId: id, clickable: true, onClick: action, blocking });
  }
}
