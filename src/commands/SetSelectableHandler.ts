import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveElementId, interpolateBraces, resolveFromBraces } from '../utils/ParamResolver';

export class SetSelectableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SELECTABLE as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p: any = command.parameters || {};
    const sm: any = (context as any).stateManager;
    const exec = (context as any).executor;
    const rm: any = (context as any).renderManager;

    let id: string | undefined = resolveElementId(p.elementId, context) || p.elementId;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    // Resolve variableKey supporting {var} and inline interpolation (e.g., sel_{i})
    let resolvedVarKey: string = '';
    try {
      if (typeof p.variableKey === 'string') {
        const s = p.variableKey;
        const m = s.match(/^\{([^}]+)\}$/);
        if (m) {
          const v = resolveFromBraces<any>(s, context);
          if (v != null) resolvedVarKey = String(v);
          else resolvedVarKey = s; // keep original if unresolved
        } else if (/\{[^}]+\}/.test(s)) {
          resolvedVarKey = String(interpolateBraces(s, context));
        } else {
          resolvedVarKey = String(s);
        }
      }
    } catch { resolvedVarKey = String(p.variableKey || ''); }

    // Persist configuration on node for later single-select cancellation
    const cfg = {
      overlayResourceId: p.overlayResourceId || p.selectedResourceId || '',
      effect: p.effect || '',
      variableKey: resolvedVarKey,
      onSelectedCommands: Array.isArray(p.onSelectedCommands) ? p.onSelectedCommands : [],
      onCancelSelectedCommands: Array.isArray(p.onCancelSelectedCommands) ? p.onCancelSelectedCommands : [],
      singleSelect: !!p.singleSelect,
      clickGuardMs: (p && Number.isFinite(Number(p.clickGuardMs))) ? Number(p.clickGuardMs) : 0,
    };
    try { (node as any).__selectConfig = cfg; } catch {}

    // Toggle interactivity
    const selectable = p.selectable !== false;
    if (node.__selectHandler) { try { node.off?.('pointertap', node.__selectHandler); } catch {} }
    if (!selectable) {
      try { (node as any).eventMode = 'auto'; (node as any).interactive = false; } catch {}
      node.cursor = 'default';
      return this.createSuccessResult({ elementId: id, selectable: false });
    }
    try { (node as any).eventMode = 'static'; (node as any).interactive = true; } catch {}
    node.cursor = 'pointer';

    const buildSystemCommands = (targetId: string, selected: boolean, config: any): GameCommand[] => {
      const cmds: GameCommand[] = [] as any;
      const overlayId = `${targetId}__overlay`;
      if (selected) {
        if (config.overlayResourceId && String(config.overlayResourceId).trim() !== '') {
          cmds.push({
            id: `sys_show_overlay_${targetId}`,
            type: CommandType.SHOW_IMAGE as any,
            parameters: {
              elementId: overlayId,
              resourceId: config.overlayResourceId,
              position: { x: 0, y: 0 },
              parentId: targetId,
              visible: true,
              zIndex: 9999,
              // 居中对齐由 SHOW_IMAGE 默认行为处理（我们已移除 align，并默认 anchor=0.5）
              style: { anchorX: 0.5, anchorY: 0.5 }
            }
          } as any);
        }
        if (config.effect && String(config.effect).trim() !== '') {
          const eff = String(config.effect).trim();
          if (eff.toLowerCase() === 'pulse') {
            cmds.push({ id: `sys_loop_pulse_${targetId}`, type: CommandType.ANIMATE_LOOP as any, parameters: { elementId: targetId, mode: 'preset', loopType: 'pulse' } });
          } else {
            cmds.push({ id: `sys_loop_anim_${targetId}`, type: CommandType.ANIMATE_LOOP as any, parameters: { elementId: targetId, mode: 'resource', animId: eff } });
          }
        }
      } else {
        if (config.overlayResourceId && String(config.overlayResourceId).trim() !== '') {
          cmds.push({ id: `sys_hide_overlay_${targetId}`, type: CommandType.SET_ELEMENT_STYLE as any, parameters: { elementId: overlayId, style: { display: 'none', scale: 0 } } });
        }
        cmds.push({ id: `sys_stop_anim_${targetId}`, type: CommandType.STOP_ANIMATION as any, parameters: { elementId: targetId } });
      }
      return cmds;
    };

    // Bind commands: freeze/interpolate only for temp variables in braces
    const bindToSelf = (arr: GameCommand[], selfId: string): GameCommand[] => {
      const sm: any = (context as any).stateManager;
      const isTempVar = (name: string): boolean => { try { return !!sm?.hasTemp?.(name); } catch { return false; } };
      const containsTempBrace = (s: string): boolean => { try { const re = /\{([^}]+)\}/g; let m: RegExpExecArray | null; while ((m = re.exec(s))) { if (isTempVar(String(m[1]).trim())) return true; } return false; } catch { return false; } };
      const deep = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(deep);
        if (obj && typeof obj === 'object') {
          const out: any = {};
          for (const k of Object.keys(obj)) {
            if (k === 'parameters' && obj[k] && typeof obj[k] === 'object') {
              const rawParams = obj[k];
              const p0: any = deep(rawParams);
              if (typeof rawParams.elementId === 'string') {
                const s = rawParams.elementId; const m = s.match(/^\{([^}]+)\}$/);
                if (m) { const varName = m[1].trim(); if (isTempVar(varName)) p0.elementId = selfId; else p0.elementId = s; }
                else if (containsTempBrace(s)) { p0.elementId = interpolateBraces(s, context); }
              }
              if (typeof rawParams.parentId === 'string') {
                const s2 = rawParams.parentId; const m2 = s2.match(/^\{([^}]+)\}$/);
                if (m2) { const varName2 = m2[1].trim(); if (isTempVar(varName2)) p0.parentId = selfId; else p0.parentId = s2; }
                else if (containsTempBrace(s2)) { p0.parentId = interpolateBraces(s2, context); }
              }
              out[k] = p0;
            } else { out[k] = deep(obj[k]); }
          }
          return out;
        }
        return obj;
      };
      return deep(arr);
    };

    const runSelectionFlow = async (targetId: string, toSelected: boolean, config: any) => {
      const sys = buildSystemCommands(targetId, toSelected, config);
      const userRaw = toSelected ? (config.onSelectedCommands || []) : (config.onCancelSelectedCommands || []);
      const user = bindToSelf(userRaw, targetId);
      const list: GameCommand[] = ([] as GameCommand[]).concat(sys, user).filter(Boolean);
      if (list.length) await exec.executeCommands(list);
    };

    // Expose reusable hooks so other handlers can trigger the same logic
    const applySelectState = async (targetId: string, toSelected: boolean) => {
      // Write last-changing ID as early as possible for downstream commands
      sm?.setVariable?.('lastChangingSelectStateID', targetId); 
      // Single-select: cancel previous selection if any and different
      if (toSelected && cfg.singleSelect) {
        const prevId: string | undefined = sm?.getVariable?.('lastSelectedSelectableID') || sm?.getVariable?.('lastChangingSelectStateID');
        if (prevId && prevId !== targetId) {
          const prevNode = rm?.getNode ? rm.getNode(prevId) : undefined;
          const prevCfg = (prevNode as any)?.__selectConfig || { overlayResourceId: '', effect: '', onCancelSelectedCommands: [] };
          try { (prevNode as any).__selected = false; } catch {}
          await runSelectionFlow(prevId, false, prevCfg);
          const prevVarKey: string | undefined = prevCfg?.variableKey;
          if (prevVarKey && sm && typeof sm.setVariable === 'function') {
            sm.setVariable(prevVarKey, false);
          }
        }
      }

      // Update self state & variables
      try { (node as any).__selected = toSelected; } catch {}
      const variableKey: string | undefined = cfg.variableKey;
      if (variableKey) { try { sm?.setVariable?.(variableKey, toSelected); } catch {} }

      // System + user flows for self
      await runSelectionFlow(targetId, toSelected, cfg);

      // Track last-changing & last-selected
      sm?.setVariable?.('lastChangingSelectStateID', targetId);
      if (toSelected) { try { sm?.setVariable?.('lastSelectedSelectableID', targetId); } catch {} }
    };

    const onTap = async () => {
      const rmAny: any = rm as any;
      const now = Date.now();
      const guardUntil = Number(rmAny.__selectGuardUntil || 0);
      if (now < guardUntil) return; // class-wide guard window for selectable interactions
      const next = !((node as any).__selected === true);
      await applySelectState(id, next);
      const ms = (node as any).__selectConfig?.clickGuardMs || 0;
      if (ms > 0) { rmAny.__selectGuardUntil = Date.now() + ms; }
    };

    // Initialize according to bound variable (optional)
    try {
      // 若绑定了变量且当前未定义，初始化为 false，避免出现 undefined
      if (cfg.variableKey) {
        const cur = sm?.getVariable?.(cfg.variableKey);
        if (cur === undefined) {
          try { sm?.setVariable?.(cfg.variableKey, false); } catch {}
        }
      }
      const initSel = (typeof (node as any).__selected === 'boolean') ? (node as any).__selected
        : (cfg.variableKey ? !!sm?.getVariable?.(cfg.variableKey) : false);
      try { (node as any).__selected = initSel; } catch {}
      // 按封装/复用原则：初始化时不主动停止元素现有动画，避免干扰 SHOW_IMAGE 的入场/循环
      // 仅当初始为选中时，执行系统分支以展示覆盖图/启动选择特效；未选中则保持现状
      if (initSel) {
        const sysInit = buildSystemCommands(id, true, cfg);
        if (sysInit.length) exec.executeCommands(sysInit);
      }
    } catch {}

    node.on?.('pointertap', onTap);
    (node as any).__selectHandler = onTap;
    (node as any).__applySelectState = applySelectState;
    (node as any).__toggleSelectState = () => applySelectState(id, !((node as any).__selected === true));
    return this.createSuccessResult({ elementId: id, selectable: true });
  }
}

export default SetSelectableHandler;
