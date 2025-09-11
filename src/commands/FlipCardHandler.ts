import { CommandType, GameCommand, CommandContext, CommandResult } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { Animator } from '../browser/Animator';

export class FlipCardHandler extends BaseCommandHandler {
  // 自定义类型名，执行器会做大小写兼容
  readonly type = CommandType.FLIP_CARD;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const elementId: string = p.elementId;
    if (!elementId) return this.createErrorResult('Missing required parameter: elementId');
    const rm: any = context.renderManager as any;
    const node = rm?.getNode ? rm.getNode(elementId) : null;
    if (!node) return this.createErrorResult(`Element not found: ${elementId}`);

    // 解析前/后贴图 URL
    const resolveUrl = (idOrUrl?: string): string | undefined => {
      if (!idOrUrl) return undefined;
      const res = (context as any).resourceManager?.getResource?.(idOrUrl);
      return res?.url || idOrUrl;
    };

    const backUrl = resolveUrl(p.backResourceId || p.backSrc);
    const rememberedFront = (node as any).__frontSrc as string | undefined;
    const frontUrl = resolveUrl(p.frontResourceId || p.frontSrc) || rememberedFront || this.getCurrentTextureUrl(node);
    if (!backUrl) return this.createErrorResult('Missing backResourceId/backSrc');

    const total = Math.max(100, Number(p.duration) || 600);
    const half = Math.floor(total / 2);
    const easing: any = p.easing || 'easeInOutQuad';
    const showBack: boolean = p.showBack !== false; // 默认翻到背面

    const animator = new Animator();
    // 使用中心翻转
    if ((node as any).anchor && (node as any).anchor.set) {
      const oldAx = (node as any).anchor.x ?? 0;
      const oldAy = (node as any).anchor.y ?? 0;
      const oldX = (node as any).x || 0;
      const oldY = (node as any).y || 0;
      const w = (node as any).width || 0;
      const h = (node as any).height || 0;
      (node as any).anchor.set(0.5);
      (node as any).x = oldX + w * (oldAx - 0.5);
      (node as any).y = oldY + h * (oldAy - 0.5);
    }

    // 第一半：缩到 0
    const from1 = { ...this.stateToAnim(node) };
    const to1   = { scale: { x: 0.01, y: node.scale?.y ?? 1 } };
    await animator.animate(node as any, from1, to1, half, easing);

    // 中点：切贴图
    this.setTexture(node, showBack ? backUrl : frontUrl);

    // 第二半：从 0 回到 1
    const from2 = { ...this.stateToAnim(node) };
    const to2   = { scale: { x: 1, y: node.scale?.y ?? 1 } };
    await animator.animate(node as any, from2, to2, total - half, easing);

    // 记录当前面（便于下次翻回）
    (node as any).__frontSrc = frontUrl;
    (node as any).__backSrc = backUrl;
    (node as any).__isBack = showBack;

    return this.createSuccessResult({ elementId, showBack, duration: total });
  }

  private stateToAnim(node: any) {
    return {
      alpha: node.alpha ?? 1,
      x: node.x ?? 0,
      y: node.y ?? 0,
      scale: { x: node.scale?.x ?? 1, y: node.scale?.y ?? 1 }
    };
  }

  private getCurrentTextureUrl(node: any): string | undefined {
    try {
      const tex = node.texture; const base = tex?.baseTexture; const r = base?.resource;
      return r?.url || r?.src || r?.source?.currentSrc || r?.source?.src;
    } catch { return undefined; }
  }

  private setTexture(node: any, url?: string) {
    if (!url) return;
    try {
      const tex = (globalThis as any).PIXI?.Texture?.from ? (globalThis as any).PIXI.Texture.from(url) : null;
      if (tex) node.texture = tex;
    } catch {}
  }
}
