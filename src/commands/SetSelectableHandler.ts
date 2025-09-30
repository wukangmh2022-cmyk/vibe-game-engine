import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { resolveIdFromBraces } from '../utils/ParamResolver';

export class SetSelectableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SELECTABLE as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p: any = command.parameters || {};
    const sm: any = (context as any).stateManager;
    const exec = (context as any).executor;
    const rm: any = (context as any).renderManager;

    let id: string | undefined = resolveIdFromBraces(p.elementId, context) || p.elementId;
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    // Persist configuration on node for later single-select cancellation
    const cfg = {
      overlayResourceId: p.overlayResourceId || p.selectedResourceId || '',
      effect: p.effect || '',
      variableKey: p.variableKey || '',
      onSelectedCommands: Array.isArray(p.onSelectedCommands) ? p.onSelectedCommands : [],
      onCancelSelectedCommands: Array.isArray(p.onCancelSelectedCommands) ? p.onCancelSelectedCommands : [],
      singleSelect: !!p.singleSelect,
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

    const runSelectionFlow = (targetId: string, toSelected: boolean, config: any) => {
      const sys = buildSystemCommands(targetId, toSelected, config);
      const user = toSelected ? (config.onSelectedCommands || []) : (config.onCancelSelectedCommands || []);
      const list: GameCommand[] = ([] as GameCommand[]).concat(sys, user).filter(Boolean);
      if (list.length) exec.executeCommands(list);
    };

    const onTap = () => {
      const next = !((node as any).__selected === true);

      // Single-select: cancel previous selection if any and different
      if (next && cfg.singleSelect) {
        const prevId: string | undefined = sm?.getVariable?.('lastSelectedSelectableID') || sm?.getVariable?.('lastChangingSelectStateID');
        if (prevId && prevId !== id) {
          const prevNode = rm?.getNode ? rm.getNode(prevId) : undefined;
          const prevCfg = (prevNode as any)?.__selectConfig || { overlayResourceId: '', effect: '', onCancelSelectedCommands: [] };
          try { (prevNode as any).__selected = false; } catch {}
          runSelectionFlow(prevId, false, prevCfg);
          const prevVarKey: string | undefined = prevCfg?.variableKey;
          if (prevVarKey && sm && typeof sm.setVariable === 'function') {
            sm.setVariable(prevVarKey, false);
          }
        }
      }

      // Update self state & variables
      try { (node as any).__selected = next; } catch {}
      const variableKey: string | undefined = cfg.variableKey;
      if (variableKey) { try { sm?.setVariable?.(variableKey, next); } catch {} }

      // System + user flows for self
      runSelectionFlow(id, next, cfg);

      // Track last-changing & last-selected
      try { sm?.setVariable?.('lastChangingSelectStateID', id); } catch {}
      if (next) { try { sm?.setVariable?.('lastSelectedSelectableID', id); } catch {} }
    };

    // Initialize according to bound variable (optional)
    try {
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
    return this.createSuccessResult({ elementId: id, selectable: true });
  }
}

export default SetSelectableHandler;
