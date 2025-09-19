import { BaseCommandHandler } from '../core/CommandExecutor';
import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';

declare const PIXI: any;

export class SetSelectableHandler extends BaseCommandHandler {
  readonly type = CommandType.SET_SELECTABLE as any;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p: any = command.parameters || {};
    let id: string | undefined = p.elementId;
    const sm: any = (context as any).stateManager;
    if (!id && p.elementIdVar && sm?.getVariable) {
      try { id = sm.getVariable(p.elementIdVar); } catch {}
    }
    if (!id) return this.createErrorResult('Missing required parameter: elementId');

    const rm: any = (context as any).renderManager;
    const node = rm?.getNode ? rm.getNode(id) : undefined;
    if (!node) return this.createErrorResult(`Element not found: ${id}`);

    const selectable = p.selectable !== false;
    // clear previous
    if (node.__selectHandler) { try { node.off?.('pointertap', node.__selectHandler); } catch {} }
    if (!selectable) {
      node.eventMode = 'auto';
      node.cursor = 'default';
      return this.createSuccessResult({ elementId: id, selectable: false });
    }

    // Enable interactivity (Pixi v7: eventMode; v6: interactive)
    try { (node as any).eventMode = 'static'; } catch {}
    try { (node as any).interactive = true; } catch {}
    node.cursor = 'pointer';

    const overlayResId: string | undefined = p.overlayResourceId || p.selectedResourceId;
    const effect: string | undefined = p.effect; // 'pulse'
    // persist configuration on node for later SetSelectedHandler / reapply
    try { (node as any).__overlayResId = overlayResId; (node as any).__selectEffect = effect; } catch {}
    const variableKey: string | undefined = p.variableKey;

    // overlay sprite holder
    const ensureOverlay = () => {
      if (node.__selectOverlay) return node.__selectOverlay;
      try {
        const P = (globalThis as any).PIXI || PIXI || rm?.getPixi?.();
        const resMgr: any = (context as any).resourceManager;
        const rid = (node as any).__overlayResId || overlayResId;
        let url: string | undefined;
        if (rid) {
          const r = resMgr?.getResource?.(rid);
          url = r?.url || r?.src;
          // If resource manager has no entry and rid looks like a URL/path, use it directly
          if (!url && typeof rid === 'string' && /\.|\//.test(rid)) url = rid;
        }
        if (!P) return null;
        let tex: any = null;
        try { tex = url ? P.Texture.from(url) : null; } catch { tex = null; }
        if (!tex) {
          // fallback simple circle
          const g = new P.Graphics();
          try {
            g.lineStyle?.(3, 0x00ff88, 1);
            g.beginFill(0x00ff88, 0.25);
          } catch {}
          g.drawCircle(0, 0, 20); g.endFill?.();
          tex = (rm?.getApp?.()?.renderer || rm?.app?.renderer)?.generateTexture(g);
          g.destroy();
        }
        const s = new P.Sprite(tex);
        s.anchor?.set?.(0.5);
        // center overlay relative to target node; handle anchor(0.5)
        try {
          const ax = (node.anchor && typeof node.anchor.x === 'number') ? node.anchor.x : 0;
          const ay = (node.anchor && typeof node.anchor.y === 'number') ? node.anchor.y : 0;
          if (Math.abs(ax - 0.5) < 1e-3 && Math.abs(ay - 0.5) < 1e-3) { s.x = 0; s.y = 0; }
          else { s.x = (node.width || 0) / 2; s.y = (node.height || 0) / 2; }
        } catch { s.x = (node.width || 0) / 2; s.y = (node.height || 0) / 2; }
        s.visible = false;
        try { node.sortableChildren = true; s.zIndex = 9999; } catch {}
        try { (s as any).eventMode = 'none'; (s as any).interactive = false; } catch {}
        try {
          // scale overlay to a reasonable size relative to target
          const nw = (node.width || 0), nh = (node.height || 0);
          if (s.width && s.height && nw && nh) {
            const ratio = Math.min(1, Math.min(nw, nh) / (Math.max(s.width, s.height) * 1.8));
            if (ratio > 0 && ratio < 1e3) s.scale?.set?.(ratio);
          }
        } catch {}
        node.addChild?.(s);
        node.__selectOverlay = s;
        return s;
      } catch { return null; }
    };

    const animator: any = new ((require('../browser/Animator').Animator) as any)();
    const applyVisual = (selected: boolean) => {
      const s = ensureOverlay();
      if (s) s.visible = selected;
      if (effect === 'pulse') {
        try {
          if (selected) { animator.loopPulseScale(node, 0.95, 1.05, 900); }
          else { animator.stop(node); if (node.scale) { node.scale.x = 1; node.scale.y = 1; } }
        } catch {}
      }
      if (!selected && node.__selectOverlay) {
        try { node.__selectOverlay.visible = false; } catch {}
      }
    };

    const onTap = () => {
      const next = !(node.__selected === true);
      node.__selected = next;
      try { sm?.setVariable?.('lastChangingSelectStateID', id); } catch {}
      if (variableKey) { try { sm?.setVariable?.(variableKey, next); } catch {} }
      applyVisual(next);
      const exec = (context as any).executor;
      const cmds = next ? (Array.isArray(p.onSelectedCommands) ? p.onSelectedCommands : []) : (Array.isArray(p.onCancelSelectedCommands) ? p.onCancelSelectedCommands : []);
      if (Array.isArray(cmds) && cmds.length) exec.executeCommands(cmds);
    };

    // Initialize visual according to existing state or bound variable
    try {
      const initSel = (typeof (node as any).__selected === 'boolean') ? (node as any).__selected
        : (variableKey ? !!sm?.getVariable?.(variableKey) : false);
      node.__selected = initSel;
      applyVisual(initSel);
    } catch { applyVisual(node.__selected === true); }
    node.on?.('pointertap', onTap);
    node.__selectHandler = onTap;
    return this.createSuccessResult({ elementId: id, selectable: true });
  }
}

export default SetSelectableHandler;
