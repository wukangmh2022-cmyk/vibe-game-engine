import { CommandType, CommandContext, CommandResult, GameCommand } from '../types';
import { BaseCommandHandler } from '../core/CommandExecutor';
import { resolveIdFromBraces } from '../utils/ParamResolver';

declare const PIXI: any;

/**
 * FIREWORK_BURST
 * Parameters:
 * - x, y: number (origin, optional)
 * - elementId: string (target element; also used as attachment if attachToId omitted)
 * (Deprecated) elementIdVar is no longer supported; use elementId: "{varName}" instead.
 * - attachToId?: string (parent to attach container under; defaults to elementId)
 * - parentId?: string (alias of attachToId)
 * Note: Use elementId/attachToId with braces syntax to reference variables, e.g. "{someVar}".
 * - count?: number (default 24)
 * - speedMin?: number (default 3)
 * - speedMax?: number (default 6)
 * - gravity?: number (default 0.35)
 * - life?: number ms (default 900)
 * - fadeOut?: boolean (default true)
 * - scaleMin?: number (default 0.4)
 * - scaleMax?: number (default 0.9)
 * - rotation?: boolean (default true)
 * - tint?: number | number[] (e.g. 0xffee88 or [0xffaa00, 0x88ccff])
 * - zIndex?: number (default 50)
 * - resourceId?: string (image id for particle)
 * - resourceIds?: string[] (multiple image ids)
 */
export class FireworkBurstHandler extends BaseCommandHandler {
  readonly type = CommandType.FIREWORK_BURST;

  async execute(command: GameCommand, context: CommandContext): Promise<CommandResult> {
    const p = command.parameters || {};
    const rm: any = context.renderManager as any;
    const app = rm?.getApp ? rm.getApp() : rm?.app;
    const stage = rm?.getStage ? rm.getStage() : app?.stage;
    if (!stage) return this.createErrorResult('Pixi stage not available');

    const elementId: string | undefined = resolveIdFromBraces(p.elementId, context) || p.elementId;
    const attachToId: string | undefined = resolveIdFromBraces(p.attachToId || p.parentId || elementId, context) || p.attachToId || p.parentId || elementId;
    const attachNode = attachToId ? rm.getNode?.(attachToId) : undefined;

    let x = Number(p.x);
    let y = Number(p.y);
    if ((!isFinite(x) || !isFinite(y)) && elementId) {
      const node = rm.getNode?.(elementId);
      if (!node) return this.createErrorResult(`Element not found: ${p.elementId}`);
      const b = node.getBounds ? node.getBounds() : { x: node.x || 0, y: node.y || 0, width: node.width || 0, height: node.height || 0 };
      x = b.x + (b.width || 0) / 2;
      y = b.y + (b.height || 0) / 2;
    }
    if (!isFinite(x) || !isFinite(y)) return this.createErrorResult('Missing origin x/y or elementId');

    const count = Math.max(1, Number(p.count) || 24);
    const speedMin = Math.max(0, Number(p.speedMin) || 3);
    const speedMax = Math.max(speedMin, Number(p.speedMax) || 6);
    const gravity = Number(p.gravity) ?? 0.35;
    const life = Math.max(50, Number(p.life) || 900);
    const fadeOut = p.fadeOut !== false;
    const scaleMin = Math.max(0.05, Number(p.scaleMin) || 0.4);
    const scaleMax = Math.max(scaleMin, Number(p.scaleMax) || 0.9);
    const rotation = p.rotation !== false;
    const zIndex = p.zIndex != null ? Number(p.zIndex) : 50;

    // Resolve textures
    const resMgr: any = (context as any).resourceManager;
    const ids: string[] = Array.isArray(p.resourceIds) && p.resourceIds.length
      ? p.resourceIds
      : (p.resourceId ? [p.resourceId] : []);
    const textures: any[] = [];
    const P = (globalThis as any).PIXI || (rm?.getPixi ? rm.getPixi() : undefined);
    for (const id of ids) {
      const r = resMgr?.getResource?.(id);
      const url = r?.url || r?.src;
      if (url && P) {
        try { textures.push(P.Texture.from(url)); } catch {}
      }
    }
    // Fallback to a simple star vector if no texture provided
    const makeFallback = () => {
      const P2 = P || (globalThis as any).PIXI;
      if (!P2) return app.renderer.generateTexture({} as any);
      const g = new P2.Graphics();
      g.beginFill(0xffffff);
      g.drawCircle(0, 0, 6);
      g.endFill();
      const tex = app.renderer.generateTexture(g);
      g.destroy();
      return tex;
    };
    if (textures.length === 0) textures.push(makeFallback());

    const tints: number[] = Array.isArray(p.tint) ? p.tint : (p.tint != null ? [p.tint] : [0xffe066, 0xff8fab, 0x9bf6ff, 0xbdb2ff, 0xcaffbf]);
    const bmStr: string = String(p.blendMode || p.blend || 'normal').toLowerCase();
    const BM = (globalThis as any).PIXI?.BLEND_MODES;
    const bmMap: Record<string, any> = BM ? {
      normal: BM.NORMAL, add: BM.ADD, additive: BM.ADD,
      screen: BM.SCREEN, multiply: BM.MULTIPLY, overlay: BM.OVERLAY,
      lighten: BM.LIGHTEN, darken: BM.DARKEN
    } : {};

    // Container to group particles
    const P3 = P || (globalThis as any).PIXI;
    const container = P3 ? new P3.Container() : new (rm.getPixi() || (globalThis as any).PIXI).Container();
    container.zIndex = zIndex;
    container.sortableChildren = false;
    if (attachNode && attachNode.addChild) {
      // attach under target element; use its local center if possible
      try {
        if ((attachNode as any).anchor && Math.abs((attachNode as any).anchor.x - 0.5) < 1e-3) {
          container.x = 0; container.y = 0; // origin at center for anchor(0.5)
        } else {
          const pw = (attachNode as any).width || 0; const ph = (attachNode as any).height || 0;
          container.x = pw / 2; container.y = ph / 2;
        }
      } catch { container.x = 0; container.y = 0; }
      attachNode.addChild(container);
    } else {
      stage.addChild(container);
    }

    const particles: any[] = [];
    for (let i = 0; i < count; i++) {
      const tex = textures[(i % textures.length) | 0];
      const s = P3 ? new P3.Sprite(tex) : new (rm.getPixi() || (globalThis as any).PIXI).Sprite(tex);
      s.anchor.set(0.5);
      s.x = attachNode ? 0 : x; s.y = attachNode ? 0 : y;
      const sc = scaleMin + Math.random() * (scaleMax - scaleMin);
      s.scale.set(sc);
      s.alpha = 1;
      if (bmMap && bmMap[bmStr] != null) {
        try { (s as any).blendMode = bmMap[bmStr]; } catch {}
      }
      if (rotation) s.rotation = Math.random() * Math.PI * 2;
      s.tint = tints[(Math.random() * tints.length) | 0];
      container.addChild(s);
      // random angle and speed
      const ang = Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      particles.push({ s, vx, vy, t: 0, life });
    }

    let last = performance.now();
    const update = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      let alive = 0;
      for (const p of particles) {
        p.t += dt;
        if (p.t >= p.life) { p.s.visible = false; continue; }
        alive++;
        p.vy += gravity * (dt / 16.66);
        p.s.x += p.vx * (dt / 16.66);
        p.s.y += p.vy * (dt / 16.66);
        if (rotation) p.s.rotation += 0.05 * (dt / 16.66);
        if (fadeOut) p.s.alpha = Math.max(0, 1 - p.t / p.life);
      }
      if (alive === 0) {
        try { stage.removeChild(container); } catch {}
        try { container.destroy({ children: true, texture: false, baseTexture: false }); } catch {}
        app.ticker.remove(tickerFn);
      }
    };
    const tickerFn = () => update(performance.now());
    app.ticker.add(tickerFn);

    return this.createSuccessResult({ count, x, y, life, zIndex });
  }
}
