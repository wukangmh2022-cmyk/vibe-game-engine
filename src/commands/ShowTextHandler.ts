import { CommandType, GameCommand, CommandContext, CommandResult, ElementConfig } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';

/**
 * 显示文本指令处理器
 */
export class ShowTextHandler extends BaseCommandHandler {
  readonly type = CommandType.SHOW_TEXT;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const text: string = typeof p.text === 'string' ? this.interpolate(p.text, context) : p.text;
    // 兼容V2：position.{x,y} 与 elementId
    const pos = p.position || {};
    const x: number = p.x ?? pos.x ?? 0;
    const y: number = p.y ?? pos.y ?? 0;
    // 安全清洗样式，避免 PIXI 颜色转换 undefined 报错
    const style: any = { ...(p.style || {}) };
    try {
      // 去掉 null/undefined 值
      Object.keys(style).forEach(k => { if (style[k] === undefined || style[k] === null) delete style[k]; });
      // 统一 fill 与 color
      if (style.color == null && style.fill == null) style.color = '#ffffff';
      if (style.fill == null && style.color != null) style.fill = style.color;
      // 阴影与描边容错
      if (style.dropShadow === true && (style.dropShadowColor == null)) style.dropShadowColor = 0x000000;
      if (!style.stroke && (style.strokeThickness == null)) style.strokeThickness = 0;
    } catch {}
    if (style.zIndex === undefined) {
      style.zIndex = 5; // 默认高于背景，低于标题
    }
    const elementId = p.elementId || p.id || `text_${Date.now()}`;
    
    if (!text) {
      return this.createErrorResult('Missing required parameter: text');
    }

    try {
      const elementConfig: ElementConfig = {
        id: elementId,
        type: 'text',
        position: { x, y },
        content: text,
        style,
        visible: true
      };

      const element = context.renderManager.createElement(elementConfig);
      // Optional: background panel image sized to text bounds + padding
      // 为避免对现有流程产生影响，默认关闭；仅当 useBackgroundImage === true 时启用
      let createdBgId: string | null = null;
      try {
        if (p.useBackgroundImage === true) {
          const bgResId: string | undefined = p.backgroundResourceId || p.panel?.resourceId;
          const padRaw = p.backgroundPadding ?? p.panel?.padding ?? 12;
          const padX = typeof padRaw === 'number' ? padRaw : (padRaw?.x ?? 12);
          const padY = typeof padRaw === 'number' ? padRaw : (padRaw?.y ?? 12);
          if (bgResId && (context.renderManager as any)?.getNode) {
            const node: any = (context.renderManager as any).getNode(elementId);
            const b = node?.getBounds ? node.getBounds() : null;
            const url = (context.resourceManager as any)?.getResource?.(bgResId)?.url;
            if (b && url) {
              const bgId = `${elementId}__bg`;
              const zUnder = (style.zIndex != null ? Number(style.zIndex) : 5) - 1;
              (context.renderManager as any).createElement({
                id: bgId,
                type: 'image',
                position: { x: b.x - padX, y: b.y - padY },
                size: { width: b.width + padX * 2, height: b.height + padY * 2 },
                src: url,
                visible: true,
                style: { zIndex: zUnder }
              });
              createdBgId = bgId;
            }
          }
        }
      } catch {}
      
      context.logger.debug(`Text displayed: ${text} at (${x}, ${y})`);
      // 支持阻塞模式：等待点击继续
      const blocking: boolean = !!p.blocking || !!p.waitForClick;
      // 默认阻塞文本点击后移除（可通过 dismissOnContinue:false 关闭）
      const dismissOnContinue: boolean = p.dismissOnContinue === false ? false : (!!p.blocking || !!p.waitForClick);
      if (blocking) {
        context.eventManager.emit('text_displayed', { elementId, blocking: true, dismissOnContinue, panelResourceId: (p.useBackgroundImage === true ? (p.backgroundResourceId || p.panel?.resourceId) : undefined) });
      await new Promise<void>((resolve) => {
          const once = (payload?: any) => {
            if (!payload || payload.elementId === elementId) resolve();
          };
          context.eventManager.once('text_continue', once);
        });
        if (dismissOnContinue && (context.renderManager as any)?.removeElement) {
          try { if (createdBgId) (context.renderManager as any).removeElement(createdBgId); } catch {}
          try { (context.renderManager as any).removeElement(elementId); } catch {}
        }
      } else {
        context.eventManager.emit('text_displayed', { elementId, blocking: false, dismissOnContinue: false, panelResourceId: (p.useBackgroundImage === true ? (p.backgroundResourceId || p.panel?.resourceId) : undefined) });
      }
      
      return this.createSuccessResult({ elementId, text, position: { x, y } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Failed to show text: ${errorMessage}`);
    }
  }

  protected getRequiredParameters(): string[] {
    return ['text'];
  }

  private interpolate(text: string, context: CommandContext): string {
    try {
      const sm: any = (context as any).stateManager;
      return text.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
        const path = String(expr).trim();
        let key = path.startsWith('gameState.') ? path.slice('gameState.'.length) : path;
        const parts = key.split('.');
        let val: any = sm?.getVariable ? sm.getVariable(parts[0]) : undefined;
        for (let i = 1; i < parts.length; i++) val = val != null ? val[parts[i]] : undefined;
        return val != null ? String(val) : '';
      });
    } catch { return text; }
  }
}
