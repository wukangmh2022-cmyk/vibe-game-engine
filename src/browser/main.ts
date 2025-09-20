import { CommandExecutor } from '../core/CommandExecutor';
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
import { GameCommand } from '../types';
import { FireworkBurstHandler } from './FireworkBurstHandler';
import { attachPixiUi } from './ui/PixiUiLayer';

declare const PIXI: any;

async function bootstrap() {
  const appEl = document.getElementById('app') as HTMLElement;
  if (!appEl) return;

  const app = new PIXI.Application({
    width: 800,
    height: 600,
    backgroundColor: 0x000000,
    antialias: true,
    resolution: Math.min(2, (window.devicePixelRatio || 1)),
    autoDensity: true
  });
  appEl.prepend(app.view as HTMLCanvasElement);
  app.stage.sortableChildren = true;

  // Expose a one-click Pixi cache clear helper
  (window as any).clearPixiCache = () => {
    try {
      const utils: any = (PIXI as any).utils;
      const BT = utils?.BaseTextureCache || {};
      const TC = utils?.TextureCache || {};
      let n = 0;
      for (const k in BT) { try { BT[k]?.destroy?.(true); } catch {} delete (BT as any)[k]; n++; }
      for (const k in TC) { try { TC[k]?.destroy?.(true); } catch {} delete (TC as any)[k]; n++; }
      try { (app.renderer as any)?.textureGC?.run?.(); } catch {}
      console.info(`[Pixi] Cleared texture caches: ${n} entries`);
    } catch (e) {
      console.warn('clearPixiCache failed', e);
    }
  };
  // Hotkey: Ctrl+Alt+K to clear cache quickly
  window.addEventListener('keydown', (e) => {
    try {
      if (e.ctrlKey && e.altKey && (e.key?.toLowerCase?.() === 'k')) {
        (window as any).clearPixiCache?.();
      }
    } catch {}
  });

  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);
  const resourceManager = new BrowserResourceManager();
  const renderManager = new PixiRendererManager(app);
  const audioManager = new BrowserAudioManager();
  const logger = console as any;

  const executor = new CommandExecutor(stateManager, eventManager, resourceManager as any, renderManager as any, audioManager as any, logger as any);
  createDefaultHandlers().forEach(h => executor.registerHandler(h));
  // Override DOM-based handlers with Pixi versions for browser runtime
  executor.registerHandler(new PixiCreateDropZoneHandler());
  executor.registerHandler(new PixiSetDraggableHandler());
  executor.registerHandler(new PixiCheckInAreaHandler());
  executor.registerHandler(new AnimateInHandler());
  executor.registerHandler(new AnimateLoopHandler());
  executor.registerHandler(new PixiSetElementStyleHandler());
  executor.registerHandler(new FlipCardHandler());
  executor.registerHandler(new SetClickableHandler());
  // executor.registerHandler(new SetSelectedHandler()); // removed
  executor.registerHandler(new SetSelectableHandler());
  // Effects
  executor.registerHandler(new FireworkBurstHandler());

  // Store skins in resourceManager for handlers & UI
  const setSkins = (skins: any) => (resourceManager as any).setSkins?.(skins);

  // Cleanup on page unload/visibility hidden to stop audio and release PIXI
  try {
    const cleanup = () => {
      try { (audioManager as any)?.stopAll?.(); } catch {}
      try { (audioManager as any)?.dispose?.(); } catch {}
      try { app.destroy(true, true); } catch {}
    };
    window.addEventListener('beforeunload', cleanup);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cleanup(); });
  } catch {}

  attachPixiUi(eventManager, resourceManager, renderManager, PIXI);

  // Load game config (support parent injection or external URL)
  let game: any = (window as any).__GAME_JSON;
  if (!game) {
    const url = (window as any).__GAME_JSON_URL || '/default-project/scene/hello-world.json';
    console.info('[Runtime] Loading JSON:', url);
    try {
      if (!(window as any).__ASSET_BASE__ && typeof url === 'string') {
        const parts = url.split('/scene/');
        const base = (parts.length > 1 ? (parts[0] + '/') : url.replace(/\/[^\/]*$/, '/'));
        (window as any).__ASSET_BASE__ = base;
      }
    } catch {}
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch JSON: ' + url);
    try {
      game = await res.json();
      console.info('[Runtime] JSON loaded OK:', game?.id || 'unknown', (game?.levels?.length || 0), 'levels');
    } catch (e) {
      console.error('[Runtime] JSON parse error for', url, e);
      const box = document.createElement('div');
      (box.style as any).position = 'absolute'; (box.style as any).left = '12px'; (box.style as any).top = '12px';
      (box.style as any).padding = '10px 12px'; (box.style as any).background = 'rgba(0,0,0,0.7)'; (box.style as any).color = '#f88'; (box.style as any).borderRadius = '6px'; (box.style as any).zIndex = '9999';
      box.textContent = 'JSON 解析失败: ' + url;
      document.body.appendChild(box);
      throw e;
    }
  }
  // make skins available for handlers/UI
  setSkins(game.skins || game.resources?.skins || {});
  const level = game.levels[0];
  // Build id -> command index for jump targets (top-level + events)
  const topIndex = new Map<string, any>();
  const allIndex = new Map<string, any>();
  (level.commands || []).forEach((c: any) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); } });
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

  // Load resources
  const images = (game.resources?.images || []) as Array<{ id: string; src: string }>;
  await resourceManager.preloadResources(images.map(img => ({ id: img.id, type: 'image', url: img.src })) as any);
  const animations = (game.resources?.animations || []) as Array<{ id: string; src: string }>;
  if (animations && animations.length) {
    await resourceManager.preloadResources(animations.map(a => ({ id: a.id, type: 'json', url: a.src })) as any);
  }
  const audios = (game.resources?.audios || []) as Array<{ id: string; src: string }>;
  if (audios && audios.length) {
    await resourceManager.preloadResources(audios.map(a => ({ id: a.id, type: 'audio', url: a.src })) as any);
  }
  // Provide audio URL resolver
  (audioManager as any).setResolver?.((id: string) => (resourceManager as any).getResource?.(id)?.url);

  // Init state
  Object.entries(level.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));

  // Register level events
  for (const ev of level.events || []) {
    indexCommands(ev.commands as any[]);
    for (const tr of ev.triggers || []) {
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
                // 将事件变量注入执行上下文，供 IF_CONDITION 表达式使用
                executor.updateContext({ event: eventVar, lastEvent: eventVar } as any);
                await executor.executeCommands(ev.commands as GameCommand[]);
              }
            } catch {}
          });
        }
      }
    }
  }

  // Handle jump_to_requested: allow JSON to jump to any indexed command
  eventManager.on('jump_to_requested', (payload: any) => {
    const target = payload?.target;
    if (!target) return;
    const cmd = allIndex.get(target) || topIndex.get(target);
    if (!cmd) { console.warn('jump target not found:', target); return; }
    // 让当前子指令链先完成，再执行跳转，避免和当前链路竞争
    setTimeout(() => {
      executor.executeCommand(cmd);
    }, 0);
  });

  // 配对检测改为 JSON 逻辑；此处不做运行时配对

  // Run initial commands
  for (const cmd of level.commands as GameCommand[]) {
    await executor.executeCommand(cmd);
  }
}

// Allow editor-embedded mode to inject JSON and trigger bootstrap
const shouldWait = (window as any).__WAIT_FOR_PARENT === true;
if (shouldWait) {
  (window as any).__BOOTSTRAP_RUNTIME = async (data?: any) => {
    if (data) (window as any).__GAME_JSON = data;
    await bootstrap();
  };
  window.addEventListener('message', (e: MessageEvent) => {
    const msg: any = e?.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'LOAD_GAME_JSON') {
      (window as any).__GAME_JSON = msg.payload;
      const boot = (window as any).__BOOTSTRAP_RUNTIME;
      if (typeof boot === 'function') boot();
    }
  });
} else {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
