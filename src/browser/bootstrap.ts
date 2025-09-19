// A reusable browser bootstrap API that mounts the runtime into a container.
// Goal: make the runtime consumable like a library (no HTML scaffolding needed).
import { CommandExecutor, BaseCommandHandler } from '../core/CommandExecutor';
import { EventManager } from '../core/EventManager';
import { StateManager } from '../core/StateManager';
import { createDefaultHandlers } from '../commands/factory';
import { PixiCreateDropZoneHandler } from './PixiCreateDropZoneHandler';
import { PixiSetDraggableHandler } from './PixiSetDraggableHandler';
import { BrowserResourceManager } from './BrowserResourceManager';
import { BrowserAudioManager } from './BrowserAudioManager';
import { PixiRendererManager } from './PixiRendererManager';
import { PixiCheckInAreaHandler } from './PixiCheckInAreaHandler';
import { AnimateInHandler } from './AnimateInHandler';
import { AnimateLoopHandler } from './AnimateLoopHandler';
import { PixiSetElementStyleHandler } from './PixiSetElementStyleHandler';
import { FlipCardHandler } from '../commands/FlipCardHandler';
import { SetClickableHandler } from '../commands/SetClickableHandler';
import SetSelectableHandler from '../commands/SetSelectableHandler';
import { FireworkBurstHandler } from './FireworkBurstHandler';
import { GameCommand } from '../types';
import { attachPixiUi } from './ui/PixiUiLayer';

declare const PIXI: any;

export interface MountOptions {
  width?: number;
  height?: number;
  resolution?: number;
  // Optional: provide a PIXI implementation (useful when consumer bundles pixi.js)
  pixi?: any;
}

export interface MountedRuntime {
  dispose(): void;
  executor: CommandExecutor;
  app: any;
  setViewScale(scale: number): void;
}

export async function mountRuntime(
  container: HTMLElement,
  game: any,
  opts: MountOptions = {}
): Promise<MountedRuntime> {
  const PIXIImpl = (opts as any).pixi || (typeof PIXI !== 'undefined' ? PIXI : undefined);
  if (!PIXIImpl) throw new Error('PIXI not found. Provide opts.pixi or load Pixi globally before mountRuntime.');
  const width = opts.width ?? (game?.levels?.[0]?.canvasWidth ?? 800);
  const height = opts.height ?? (game?.levels?.[0]?.canvasHeight ?? 600);
  const resolution = Math.min(2, (window.devicePixelRatio || 1));

  const app = new PIXIImpl.Application({
    width,
    height,
    backgroundColor: 0x000000,
    antialias: true,
    resolution,
    autoDensity: true
  });
  container.appendChild(app.view as HTMLCanvasElement);
  if (app.stage) app.stage.sortableChildren = true;

  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);
  const resourceManager = new BrowserResourceManager();
  const renderManager = new PixiRendererManager(app, PIXIImpl);
  const audioManager = new BrowserAudioManager();
  const logger = console as any;

  const executor = new CommandExecutor(
    stateManager as any,
    eventManager as any,
    resourceManager as any,
    renderManager as any,
    audioManager as any,
    logger as any
  );

  // Default + Pixi/browser-specific handlers
  createDefaultHandlers().forEach(h => executor.registerHandler(h));
  executor.registerHandler(new PixiCreateDropZoneHandler());
  executor.registerHandler(new PixiSetDraggableHandler());
  executor.registerHandler(new PixiCheckInAreaHandler());
  executor.registerHandler(new AnimateInHandler());
  executor.registerHandler(new AnimateLoopHandler());
  executor.registerHandler(new PixiSetElementStyleHandler());
  executor.registerHandler(new FlipCardHandler());
  executor.registerHandler(new SetClickableHandler());
  executor.registerHandler(new SetSelectableHandler());
  // Allow external toggling of selected state (used by SET_CLICKABLE toggle_selected)
  try { const { SetSelectedHandler } = await import('../commands/SetSelectedHandler'); executor.registerHandler(new (SetSelectedHandler as any)()); } catch {}
  executor.registerHandler(new FireworkBurstHandler());

  // Swallow editor-only grouping commands to avoid noisy errors
  class EventGroupHandler extends BaseCommandHandler {
    readonly type = 'event_group' as any;
    async execute(): Promise<any> { return this.createSuccessResult(); }
    validate(): { valid: boolean; errors: any[] } { return { valid: true, errors: [] }; }
  }
  class EventGroupHandlerUpper extends BaseCommandHandler {
    readonly type = 'EVENT_GROUP' as any;
    async execute(): Promise<any> { return this.createSuccessResult(); }
    validate(): { valid: boolean; errors: any[] } { return { valid: true, errors: [] }; }
  }
  executor.registerHandler(new EventGroupHandler());
  executor.registerHandler(new EventGroupHandlerUpper());

  // UI Layer (buttons/choices/text blocking etc.)
  attachPixiUi(eventManager, resourceManager, renderManager, PIXIImpl);

  // Skins
  (resourceManager as any).setSkins?.(game?.skins || game?.resources?.skins || {});

  // Preload resources from game.resources (support object format and legacy array format)
  const res = game?.resources;
  let images: Array<{ id: string; src: string }> = [];
  let animations: Array<{ id: string; src: string }> = [];
  let audios: Array<{ id: string; src: string }> = [];
  let videos: Array<{ id: string; src: string }> = [];

  if (Array.isArray(res)) {
    for (const r of res) {
      if (!r || !r.id) continue;
      const src = r.url || r.src;
      if (!src) continue;
      if (r.type === 'image') images.push({ id: r.id, src });
      if (r.type === 'animation' || r.type === 'json') animations.push({ id: r.id, src });
      if (r.type === 'audio' || r.type === 'sound' || r.type === 'music') audios.push({ id: r.id, src });
      if (r.type === 'video') videos.push({ id: r.id, src });
    }
  } else if (res && typeof res === 'object') {
    images = (res.images || []).map((x: any) => ({ id: x.id, src: x.src }));
    animations = (res.animations || []).map((x: any) => ({ id: x.id, src: x.src }));
    audios = (res.audios || []).map((x: any) => ({ id: x.id, src: x.src }));
    videos = (res.videos || []).map((x: any) => ({ id: x.id, src: x.src }));
  }

  if (images.length) await resourceManager.preloadResources(images.map(img => ({ id: img.id, type: 'image', url: img.src })) as any);
  if (animations.length) await resourceManager.preloadResources(animations.map(a => ({ id: a.id, type: 'json', url: a.src })) as any);
  if (audios.length) await resourceManager.preloadResources(audios.map(a => ({ id: a.id, type: 'audio', url: a.src })) as any);
  if (videos.length) await resourceManager.preloadResources(videos.map(v => ({ id: v.id, type: 'video', url: v.src })) as any);
  (audioManager as any).setResolver?.((id: string) => (resourceManager as any).getResource?.(id)?.url);

  // Init state
  const level = game?.levels?.[0];
  Object.entries(level?.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));

  // Register level events (auto/custom/expression)
  const allIndex = new Map<string, any>();
  const topIndex = new Map<string, any>();
  (level?.commands || []).forEach((c: any) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); } });
  const indexCommands = (arr: any[]) => {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      if (!c || typeof c !== 'object') continue;
      if (c.id) allIndex.set(c.id, c);
      if (Array.isArray((c as any).commands)) indexCommands((c as any).commands);
      if (Array.isArray((c as any).trueCommands)) indexCommands((c as any).trueCommands);
      if (Array.isArray((c as any).falseCommands)) indexCommands((c as any).falseCommands);
    }
  };
  for (const ev of (level?.events || [])) {
    indexCommands(ev.commands as any[]);
    for (const tr of (ev.triggers || [])) {
      if (tr.type === 'auto' && (tr as any).start === 'immediate') {
        (async () => { await executor.executeCommands(ev.commands as GameCommand[]); })();
      }
      if (tr.type === 'custom' && (tr as any).target) {
        eventManager.on((tr as any).target, async () => { await executor.executeCommands(ev.commands as GameCommand[]); });
      }
      if (tr.type === 'custom' && (tr as any).condition?.type === 'expression') {
        const expr = (tr as any).condition.expression as string;
        const m = /event\.type\s*===\s*'([^']+)'/.exec(expr || '');
        if (m) {
          const name = m[1];
          eventManager.on(name, async (eventData: any) => {
            const eventVar = { type: name, ...(eventData || {}) };
            try {
              if (eval(expr.replace(/\bevent\b/g, 'eventVar'))) {
                executor.updateContext({ event: eventVar, lastEvent: eventVar } as any);
                await executor.executeCommands(ev.commands as GameCommand[]);
              }
            } catch {}
          });
        }
      }
    }
  }

  // Jump support (optional)
  eventManager.on('jump_to_requested', (payload: any) => {
    const target = payload?.target; if (!target) return;
    const cmd = allIndex.get(target) || topIndex.get(target);
    if (!cmd) { console.warn('jump target not found:', target); return; }
    setTimeout(() => { executor.executeCommand(cmd as GameCommand); }, 0);
  });

  // Scene redirect: allow runtime to request loading another scene JSON
  const resolveUrl = (u?: string): string | undefined => {
    if (!u || typeof u !== 'string') return u;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) || u.startsWith('/')) return u; // absolute
    try {
      const base: string = (window as any).__ASSET_BASE__ || '/';
      return base.endsWith('/') ? (base + u.replace(/^\.\//, '')) : (base + '/' + u.replace(/^\.\//, ''));
    } catch { return u; }
  };
  eventManager.on('scene_redirect', (payload: any) => {
    try {
      const raw = payload && (payload.url || payload.scene || payload.path) || payload;
      const url = resolveUrl(raw);
      (logger || console).info('[runtime] scene_redirect', { raw, url });
      const fn = (window as any).__PIXICANVAS_REDIRECT__;
      if (typeof fn === 'function') {
        try { fn(url); } catch (e) { (logger || console).warn('PIXICANVAS_REDIRECT failed', e); }
        return;
      }
      // fallback to postMessage for editor-runtime.html / web runtime
      try { (window as any).postMessage?.({ type: 'LOAD_GAME_JSON', payload: url }, '*'); } catch {}
    } catch (e) {
      (logger || console).warn('scene_redirect handler failed', e);
    }
  });

  const setViewScale = (s: number) => {
    try {
      const view = app?.view as HTMLCanvasElement;
      if (!view) return;
      (view.style as any).transformOrigin = '0 0';
      (view.style as any).transform = `scale(${Number(s) || 1})`;
      (view.style as any).display = 'block';
    } catch {}
  };

  // Execute top-level commands asynchronously to avoid blocking mount/scale
  (async () => {
    try {
      for (const cmd of (level?.commands || []) as GameCommand[]) {
        // eslint-disable-next-line no-await-in-loop
        await executor.executeCommand(cmd);
      }
    } catch (e) {
      (logger || console).warn('[runtime] top-level commands run failed', e);
    }
  })();

  return {
    dispose() { try { app.destroy(true, true); } catch {} },
    executor,
    app,
    setViewScale
  };
}
