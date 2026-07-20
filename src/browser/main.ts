import { CommandExecutor } from '../core/CommandExecutor';
import { loadCommandModifiers } from './commandModifiers';
import { getGlobalCommandModifiers } from '../core/commandModifiers';
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
import { AnimateOutHandler } from './AnimateOutHandler';
import { AnimateLoopHandler } from './AnimateLoopHandler';
import { PixiSetElementStyleHandler } from './PixiSetElementStyleHandler';
import { FlipCardHandler } from '../commands/FlipCardHandler';
import { SetClickableHandler } from '../commands/SetClickableHandler';
import SetSelectableHandler from '../commands/SetSelectableHandler';
import StopAnimationHandler from '../commands/StopAnimationHandler';
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
  try {
    executor.setCommandModifiers(getGlobalCommandModifiers());
  } catch {}
  createDefaultHandlers().forEach(h => executor.registerHandler(h));
  // Override DOM-based handlers with Pixi versions for browser runtime
  executor.registerHandler(new PixiCreateDropZoneHandler());
  executor.registerHandler(new PixiSetDraggableHandler());
  executor.registerHandler(new PixiCheckInAreaHandler());
  executor.registerHandler(new AnimateInHandler());
  executor.registerHandler(new AnimateOutHandler());
  executor.registerHandler(new AnimateLoopHandler());
  executor.registerHandler(new PixiSetElementStyleHandler());
  executor.registerHandler(new FlipCardHandler());
  executor.registerHandler(new SetClickableHandler());
  // executor.registerHandler(new SetSelectedHandler()); // removed
  executor.registerHandler(new SetSelectableHandler());
  executor.registerHandler(new StopAnimationHandler());
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

  attachPixiUi(eventManager, resourceManager, renderManager, PIXI, stateManager);
  // (moved below after 'game' is loaded)

  // Track level-scoped event listeners so they can be removed on level switch
  const levelDisposers: Array<() => void> = [];
  const onLevel = (event: string, listener: any) => {
    eventManager.on(event, listener);
    levelDisposers.push(() => { try { eventManager.off(event, listener); } catch {} });
  };
  const clearLevelListeners = () => { while (levelDisposers.length) { const d = levelDisposers.pop(); try { d && d(); } catch {} } };

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
    try { await loadCommandModifiers((window as any).__ASSET_BASE__); } catch {}
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch JSON: ' + url);
    try {
      game = await res.json();
      try { if (game && typeof game === 'object') (game as any).__runtimeSceneUrl = url; } catch {}
      try { (window as any).__GAME_JSON_URL = url; } catch {}
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
  } else {
    try { await loadCommandModifiers((window as any).__ASSET_BASE__); } catch {}
  }
  // Best-effort: inject project-level skins from config.json if present (works when hosted alongside /scene/)
  try {
    const base: string = (window as any).__ASSET_BASE__ || (location.pathname.replace(/\/[^\/]*$/, '/'));
    const cfgUrl = base.endsWith('/') ? (base + 'config.json') : (base + '/config.json');
    const res = await fetch(cfgUrl);
    if (res && res.ok) {
      const cfg = await res.json();
      const skins = (cfg && (cfg.skins || (cfg.resources && cfg.resources.skins))) || undefined;
      if (skins) {
        try { setSkins(skins); } catch {}
        // Also attach to game so runtime handlers can access
        try { (game as any).skins = (game as any).skins || skins; } catch {}
      }
    }
  } catch {}
  // make skins available for handlers/UI
  setSkins(game.skins || game.resources?.skins || {});
  // Preserve original level ordering for NEXT_LEVEL across rewires within a single page session
  try {
    if (!(game as any).__originalLevels && Array.isArray(game?.levels)) {
      (game as any).__originalLevels = (game.levels as any[]).slice();
      (game as any).__currentOriginalIndex = 0;
    }
  } catch {}
  let levelIndex = 0;
  let level = game.levels[levelIndex];
  // Build id -> command index for jump targets (top-level + events)
  const topIndex = new Map<string, any>();
  const allIndex = new Map<string, any>();
  const cmdPos = new Map<string, { arr: GameCommand[]; idx: number }>();
  (level.commands || []).forEach((c: any, i: number) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); cmdPos.set(c.id, { arr: (level.commands as any), idx: i }); } });
  const indexCommands = (arr: any[]) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (!c || typeof c !== 'object') continue;
      if (c.id) { allIndex.set(c.id, c); try { cmdPos.set(c.id, { arr: arr as any, idx: i }); } catch {} }
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
  // 1) Load global variables/switches from game config (scene root)
  try {
    const gv = (game && (game.globalVariables || (game.config && game.config.globalVariables))) || {};
    const gs = (game && (game.globalSwitches || (game.config && game.config.globalSwitches))) || {};
    Object.entries(gv).forEach(([k, v]) => stateManager.setVariable(k, v));
    Object.entries(gs).forEach(([k, v]) => stateManager.setSwitch(k, v as any));
  } catch {}
  // 2) Load level-specific initial state (overrides globals when overlapping)
  Object.entries(level.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));
  // Expose current level index for downstream commands/handlers (e.g., user data sceneId default)
  try { stateManager.setVariable('levelIndex', levelIndex); } catch {}

  // Register level events (tracked for cleanup)
  for (const ev of level.events || []) {
    indexCommands(ev.commands as any[]);
    for (const tr of ev.triggers || []) {
      if (tr.type === 'auto' && (tr as any).start === 'immediate') {
        (async () => { await executor.executeCommands(ev.commands as GameCommand[]); })();
      }
      if (tr.type === 'custom' && (tr as any).target) {
        onLevel((tr as any).target, async (eventData?: any) => {
          try {
            // Start a temp instance and inject $1..$n from payload args
            const args: any[] = Array.isArray(eventData?.args) ? eventData.args : (Array.isArray(eventData) ? eventData : []);
            const instId = stateManager.beginEventInstance(stateManager.newEventInstanceId());
            try { args.forEach((v, i) => stateManager.setTempVariable(`$${i+1}`, v)); } catch {}
            try { await executor.executeCommands(ev.commands as GameCommand[]); } finally { stateManager.endEventInstance(instId); }
          } catch { await executor.executeCommands(ev.commands as GameCommand[]); }
        });
      }
      if (tr.type === 'custom' && (tr as any).condition?.type === 'expression') {
        const expr = (tr as any).condition.expression as string;
        const m = /event\.type\s*===\s*'([^']+)'/.exec(expr || '');
        if (m) {
          const name = m[1];
            onLevel(name, async (eventData: any) => {
              const eventVar = { type: name, ...(eventData || {}) };
              try {
              const getVar = (key: string) => stateManager?.getVariable?.(String(key));
              if (eval(expr.replace(/\bevent\b/g, 'eventVar'))) {
                executor.updateContext({ event: eventVar, lastEvent: eventVar } as any);
                const args: any[] = Array.isArray(eventData?.args) ? eventData.args : (Array.isArray(eventData) ? eventData : []);
                const instId = stateManager.beginEventInstance(stateManager.newEventInstanceId());
                try { args.forEach((v, i) => stateManager.setTempVariable(`$${i+1}`, v)); } catch {}
                try { await executor.executeCommands(ev.commands as GameCommand[]); } finally { stateManager.endEventInstance(instId); }
              }
              } catch {}
            });
          }
        }
      }
  }

  // Handle jump_to_requested: resume execution from target within its original array
  const executeFrom = async (targetId: string) => {
    const pos = cmdPos.get(targetId);
    if (!pos) { console.warn('jump target not indexed:', targetId); return; }
    const { arr, idx } = pos;
    for (let i = Math.max(0, idx); i < arr.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await executor.executeCommand(arr[i] as GameCommand);
    }
  };
  eventManager.on('jump_to_requested', (payload: any) => {
    const target = payload?.target; if (!target) return;
    if (!cmdPos.has(target)) { console.warn('jump target not found:', target); return; }
    setTimeout(() => { executeFrom(target); }, 0);
  });

  // Next level support: load next level within current JSON
  const wireLevel = async (lvl: any) => {
    // Clear indices and re-index
    topIndex.clear(); allIndex.clear();
    (lvl.commands || []).forEach((c: any) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); } });
    // Reset stage content and renderer registries
    try { (renderManager as any)?.clearAll?.(); } catch { try { app.stage.removeChildren(); } catch {} }
    // Remove previous level custom trigger listeners
    clearLevelListeners();
    // Apply initial state overrides
    Object.entries(lvl.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));
    // Register triggers
    for (const ev of lvl.events || []) {
      indexCommands(ev.commands as any[]);
      for (const tr of ev.triggers || []) {
        if (tr.type === 'auto' && (tr as any).start === 'immediate') {
          (async () => { await executor.executeCommands(ev.commands as GameCommand[]); })();
        }
        if (tr.type === 'custom' && (tr as any).target) {
          onLevel((tr as any).target, async (eventData?: any) => {
            try {
              const args: any[] = Array.isArray(eventData?.args) ? eventData.args : (Array.isArray(eventData) ? eventData : []);
              const instId = stateManager.beginEventInstance(stateManager.newEventInstanceId());
              try { args.forEach((v, i) => stateManager.setTempVariable(`$${i+1}`, v)); } catch {}
              try { await executor.executeCommands(ev.commands as GameCommand[]); } finally { stateManager.endEventInstance(instId); }
            } catch { await executor.executeCommands(ev.commands as GameCommand[]); }
          });
        }
        if (tr.type === 'custom' && (tr as any).condition?.type === 'expression') {
          const expr = (tr as any).condition.expression as string;
          const m = /event\.type\s*===\s*'([^']+)'/.exec(expr || '');
          if (m) {
            const name = m[1];
            onLevel(name, async (eventData: any) => {
              const eventVar = { type: name, ...(eventData || {}) };
              try {
                if (eval(expr.replace(/\bevent\b/g, 'eventVar'))) {
                  executor.updateContext({ event: eventVar, lastEvent: eventVar } as any);
                  const args: any[] = Array.isArray(eventData?.args) ? eventData.args : (Array.isArray(eventData) ? eventData : []);
                  const instId = stateManager.beginEventInstance(stateManager.newEventInstanceId());
                  try { args.forEach((v, i) => stateManager.setTempVariable(`$${i+1}`, v)); } catch {}
                  try { await executor.executeCommands(ev.commands as GameCommand[]); } finally { stateManager.endEventInstance(instId); }
                }
              } catch {}
            });
          }
        }
      }
    }
    // Run top-level commands
    for (const cmd of lvl.commands as GameCommand[]) {
      // eslint-disable-next-line no-await-in-loop
      await executor.executeCommand(cmd);
    }
  };

  eventManager.on('next_level_requested', async () => {
    const orig: any[] = Array.isArray((game as any).__originalLevels) ? (game as any).__originalLevels : (game.levels || []);
    let curIdx: number = typeof (game as any).__currentOriginalIndex === 'number' ? (game as any).__currentOriginalIndex : Math.max(0, orig.findIndex(lv => lv?.id === level?.id));
    const nextIdx = curIdx + 1;
    if (!(nextIdx < orig.length)) { console.info('[Runtime] No more levels in current JSON'); return; }
    game = { ...(game as any), levels: [ orig[nextIdx], ...orig.filter((_, i) => i !== nextIdx) ], __originalLevels: orig, __currentOriginalIndex: nextIdx } as any;
    levelIndex = 0; level = game.levels[0];
    try { stateManager.setVariable('levelIndex', levelIndex); } catch {}
    await wireLevel(level);
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
