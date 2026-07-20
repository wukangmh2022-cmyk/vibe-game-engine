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
import { AnimateOutHandler } from './AnimateOutHandler';
import { AnimateLoopHandler } from './AnimateLoopHandler';
import { PixiSetElementStyleHandler } from './PixiSetElementStyleHandler';
import { FlipCardHandler } from '../commands/FlipCardHandler';
import { SetClickableHandler } from '../commands/SetClickableHandler';
import SetSelectableHandler from '../commands/SetSelectableHandler';
import StopAnimationHandler from '../commands/StopAnimationHandler';
import ScriptAssignHandler from '../commands/ScriptAssignHandler';
import { FireworkBurstHandler } from './FireworkBurstHandler';
import ChangeSelectStateHandler from '../commands/ChangeSelectStateHandler';
import { GameCommand } from '../types';
import { getGlobalCommandModifiers } from '../core/commandModifiers';
import { attachPixiUi } from './ui/PixiUiLayer';
import { createRpgHandlers } from '../rpg';

declare const PIXI: any;

export interface MountOptions {
  width?: number;
  height?: number;
  resolution?: number;
  // Optional: provide a PIXI implementation (useful when consumer bundles pixi.js)
  pixi?: any;
  // Optional: start from specific level index without reordering
  startLevelIndex?: number;
}

export interface MountedRuntime {
  dispose(): void;
  hardDispose(): void;
  executor: CommandExecutor;
  app: any;
  setViewScale(scale: number): void;
  eventManager: EventManager;
  stateManager: StateManager;
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
  // Keep a singleton audio manager across mounts to let BGM persist between scenes/levels
  const audioManager: any = (window as any).__AUDIO_MANAGER__ || new BrowserAudioManager();
  try { (window as any).__AUDIO_MANAGER__ = audioManager; } catch {}
  const logger = console as any;
  try { const { RemoteUser } = await import('../index'); (window as any).__REMOTE_USER__ = (RemoteUser as any)?.instance || RemoteUser; } catch {}

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
  executor.registerHandler(new AnimateOutHandler());
  executor.registerHandler(new AnimateLoopHandler());
  executor.registerHandler(new PixiSetElementStyleHandler());
  executor.registerHandler(new FlipCardHandler());
  executor.registerHandler(new SetClickableHandler());
  executor.registerHandler(new SetSelectableHandler());
  executor.registerHandler(new ChangeSelectStateHandler());
  executor.registerHandler(new StopAnimationHandler());
  executor.registerHandler(new ScriptAssignHandler());
  // Allow external toggling of selected state (used by SET_CLICKABLE toggle_selected)
  try { const { SetSelectedHandler } = await import('../commands/SetSelectedHandler'); executor.registerHandler(new (SetSelectedHandler as any)()); } catch {}
  executor.registerHandler(new FireworkBurstHandler());
  createRpgHandlers().forEach(h => executor.registerHandler(h));

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

  try {
    executor.setCommandModifiers(getGlobalCommandModifiers());
  } catch {}

  // UI Layer (buttons/choices/text blocking etc.)
  attachPixiUi(eventManager, resourceManager, renderManager, PIXIImpl, stateManager);

  // Preserve original level ordering across full-remount NEXT_LEVEL operations
  try {
    if (!(game as any).__originalLevels && Array.isArray(game?.levels)) {
      (game as any).__originalLevels = (game.levels as any[]).slice();
      // __currentOriginalIndex will be finalized after computing levelIndex below
    }
  } catch {}

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

  // Init state: load global variables/switches first, then level.initialState overrides
  let levelIndex = 0;
  try {
    const count = Array.isArray((game as any)?.levels) ? (game as any).levels.length : 0;
    const desired = (opts && typeof (opts as any).startLevelIndex === 'number') ? Number((opts as any).startLevelIndex) : 0;
    if (count > 0) levelIndex = Math.max(0, Math.min(count - 1, isNaN(desired) ? 0 : desired));
  } catch {}
  let level = game?.levels?.[levelIndex];
  // Expose scene meta for downstream handlers and scripts
  try { (window as any).__GAME_JSON = game; } catch {}
  try {
    const sceneUrl = (game as any)?.__runtimeSceneUrl;
    if (sceneUrl && typeof sceneUrl === 'string') (window as any).__GAME_JSON_URL = sceneUrl;
  } catch {}
  try {
    stateManager.setVariable('levelIndex', levelIndex);
    stateManager.setVariable('currentLevelIndex', levelIndex);
    stateManager.setVariable('_levelIndex', levelIndex);
    const sceneId = (game as any)?.id || 'scene';
    const sceneName = (game as any)?.name || '';
    stateManager.setVariable('_sceneId', String(sceneId));
    if (sceneName) stateManager.setVariable('_sceneName', String(sceneName));
  } catch {}
  // Keep a marker of the absolute index of current level in original ordering
  try { (game as any).__currentOriginalIndex = levelIndex; } catch {}
  try {
    const gv = (game && (game.globalVariables || (game.config && game.config.globalVariables))) || {};
    const gs = (game && (game.globalSwitches || (game.config && game.config.globalSwitches))) || {};
    Object.entries(gv).forEach(([k, v]) => stateManager.setVariable(k, v));
    Object.entries(gs).forEach(([k, v]) => stateManager.setSwitch(k as string, v as any));
  } catch {}
  Object.entries(level?.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));

  // Register level events (auto/custom/expression)
  const allIndex = new Map<string, any>();
  const topIndex = new Map<string, any>();
  const cmdPos = new Map<string, { arr: GameCommand[]; idx: number }>();
  (level?.commands || []).forEach((c: any, i: number) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); cmdPos.set(c.id, { arr: (level?.commands as any) || [], idx: i }); } });
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
  // Track level-scoped listeners so we can remove them on level switch
  const levelDisposers: Array<() => void> = [];
  const onLevel = (event: string, listener: any) => { eventManager.on(event, listener); levelDisposers.push(() => { try { eventManager.off(event, listener); } catch {} }); };
  const clearLevelListeners = () => { while (levelDisposers.length) { const d = levelDisposers.pop(); try { d && d(); } catch {} } };

  const wireLevelTriggers = (lvl: any) => {
    for (const ev of (lvl?.events || [])) {
      indexCommands(ev.commands as any[]);
      for (const tr of (ev.triggers || [])) {
        if (tr.type === 'auto' && (tr as any).start === 'immediate') {
          (async () => { await executor.executeCommands(ev.commands as GameCommand[]); })();
        }
        if (tr.type === 'custom' && (tr as any).target) {
          onLevel((tr as any).target, async (eventData?: any) => {
            try {
              const args: any[] = Array.isArray(eventData?.args) ? eventData.args : (Array.isArray(eventData) ? eventData : []);
              const inst = stateManager.beginEventInstance(stateManager.newEventInstanceId());
              try { args.forEach((v, i) => stateManager.setTempVariable(`$${i+1}`, v)); } catch {}
              try { await executor.executeCommands(ev.commands as GameCommand[]); } finally { stateManager.endEventInstance(inst); }
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
                  const inst = stateManager.beginEventInstance(stateManager.newEventInstanceId());
                  try { args.forEach((v, i) => stateManager.setTempVariable(`$${i+1}`, v)); } catch {}
                  try { await executor.executeCommands(ev.commands as GameCommand[]); } finally { stateManager.endEventInstance(inst); }
                }
              } catch {}
            });
          }
        }
      }
    }
  };
  wireLevelTriggers(level);

  // Jump support: execute sequentially from target command within its original array
  const executeFrom = async (targetId: string) => {
    const pos = cmdPos.get(targetId);
    if (!pos) { console.warn('jump target not indexed:', targetId); return; }
    const { arr, idx } = pos;
    // Execute the remaining commands within a single temporary scope (event-instance scoped)
    const start = Math.max(0, idx);
    const slice = (arr as GameCommand[]).slice(start);
    await executor.executeCommands(slice);
  };
  eventManager.on('jump_to_requested', (payload: any) => {
    const target = payload?.target; if (!target) return;
    if (!cmdPos.has(target)) { console.warn('jump target not found:', target); return; }
    setTimeout(() => { executeFrom(target); }, 0);
  });

  // Next-level support: prefer full remount like scene redirect when editor hook exists
  eventManager.on('next_level_requested', async () => {
    try {
      const orig: any[] = Array.isArray((game as any).__originalLevels) ? (game as any).__originalLevels : ((game?.levels || []) as any[]);
      // Determine current original index by stored marker or by id lookup
      let curIdx: number = typeof (game as any).__currentOriginalIndex === 'number' ? (game as any).__currentOriginalIndex : Math.max(0, orig.findIndex(lv => lv?.id === level?.id));
      const nextIdx = curIdx + 1;
      {
        const curId = level?.id; const nextId = orig[nextIdx]?.id;
        const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1';
        if (dbg) console.info('[runtime] NEXT_LEVEL requested', { curIdx, curId, nextIdx, nextId, total: orig.length });
      }
      if (!(nextIdx < orig.length)) { try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) (logger || console).info('[runtime] no more levels'); } catch {} return; }
      const hasEditorRedirect = typeof (window as any).__PIXICANVAS_REDIRECT__ === 'function';
      if (hasEditorRedirect) {
        // Keep original ordering; handoff absolute index to editor for remount
        const payload = { ...(game as any), __originalLevels: orig, __currentOriginalIndex: nextIdx, levelIndex: nextIdx } as any;
        { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[runtime] NEXT_LEVEL redirect via editor', { nextIdx, nextId: orig[nextIdx]?.id }); }
        await eventManager.emit('scene_redirect', payload);
        return;
      }
      // Fallback: in-place switch (standalone browser runtime)
      levelIndex = nextIdx; level = orig[nextIdx];
      try { (renderManager as any)?.clearAll?.(); } catch { try { app.stage.removeChildren(); } catch {} }
      allIndex.clear(); topIndex.clear();
      (level?.commands || []).forEach((c: any) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); } });
      clearLevelListeners();
      try {
        stateManager.setVariable('levelIndex', levelIndex);
        stateManager.setVariable('currentLevelIndex', levelIndex);
        stateManager.setVariable('_levelIndex', levelIndex);
      } catch {}
      Object.entries(level?.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));
      wireLevelTriggers(level);
      // Execute whole level root commands in a single temporary scope
      await executor.executeCommands((level?.commands || []) as GameCommand[]);
      try { (game as any).__currentOriginalIndex = nextIdx; } catch {}
    } catch (e) {
      try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) (logger || console).warn('[runtime] next_level handling failed', e); } catch {}
    }
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
      const levelIndex = (payload && typeof payload.levelIndex !== 'undefined') ? Number(payload.levelIndex) : undefined;
      {
        const curArr: any[] = Array.isArray((game as any)?.levels) ? (game as any).levels : [];
        const curIdx = Math.max(0, curArr.findIndex(lv => lv?.id === level?.id));
        const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1';
        if (dbg) console.info('[runtime] SCENE_REDIRECT received', { raw, levelIndex, curLevelId: level?.id, curIdx, sceneId: (game as any)?.id });
      }
      // If payload is a full scene object (e.g., NEXT_LEVEL editor handoff), log the absolute target index hint
      {
        if (raw && typeof raw === 'object' && Array.isArray((raw as any)?.levels)) {
          const hint = (typeof (raw as any).__currentOriginalIndex === 'number')
            ? (raw as any).__currentOriginalIndex
            : (typeof levelIndex === 'number' ? levelIndex : 0);
          let tgtId: any;
          if (Array.isArray((raw as any)?.__originalLevels) && typeof hint === 'number') {
            tgtId = (raw as any).__originalLevels?.[hint]?.id;
          } else {
            tgtId = (raw as any)?.levels?.[0]?.id;
          }
          const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1';
          if (dbg) console.info('[runtime] scene_redirect (object)', { resolvedAbsIndexHint: hint, targetId: tgtId, sceneId: (raw as any)?.id });
        }
      }
      // Special token: 'this' means reload current scene
      if (typeof raw === 'string' && raw.trim().toLowerCase() === 'this') {
        {
          const curArr: any[] = Array.isArray((game as any)?.levels) ? (game as any).levels : [];
          const curIdx = Math.max(0, curArr.findIndex(lv => lv?.id === level?.id));
          const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1';
          if (dbg) console.info('[runtime] scene_redirect (reload current)', { raw, resolvedIdx: (typeof levelIndex === 'number' ? levelIndex : curIdx), targetId: (typeof levelIndex === 'number' ? curArr[levelIndex]?.id : level?.id), sceneId: (game as any)?.id });
        }
        const fn = (window as any).__PIXICANVAS_REDIRECT__;
        if (typeof fn === 'function') {
          try { fn({ reload: true, currentLevelId: level?.id }); } catch (e) { (logger || console).warn('PIXICANVAS_REDIRECT reload failed', e); }
          return;
        }
      }
      const url = resolveUrl(raw);
      { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[runtime] scene_redirect (url)', { raw, url, levelIndex, sceneId: (game as any)?.id }); }
      const fn = (window as any).__PIXICANVAS_REDIRECT__;
      if (typeof fn === 'function') {
        try {
          if (typeof levelIndex === 'number' && !Number.isNaN(levelIndex)) {
            fn({ url, levelIndex });
          } else {
            fn(url);
          }
        } catch (e) { (logger || console).warn('PIXICANVAS_REDIRECT failed', e); }
        return;
      }
      // fallback to postMessage for editor-runtime.html / web runtime
      try { (window as any).postMessage?.({ type: 'LOAD_GAME_JSON', payload: url }, '*'); } catch {}
    } catch (e) {
      try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) (logger || console).warn('scene_redirect handler failed', e); } catch {}
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
      try { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) (logger || console).warn('[runtime] top-level commands run failed', e); } catch {}
    }
  })();

  const commonTearDown = () => {
    try { app.destroy(true, true); } catch {}
    // Clear global Pixi texture caches to avoid leaking blob URLs across re-mounts
    try {
      const utils: any = (PIXIImpl as any)?.utils;
      const BT = utils?.BaseTextureCache || {};
      const TC = utils?.TextureCache || {};
      for (const k in BT) { try { BT[k]?.destroy?.(true); } catch {} delete (BT as any)[k]; }
      for (const k in TC) { try { TC[k]?.destroy?.(true); } catch {} delete (TC as any)[k]; }
      (app.renderer as any)?.textureGC?.run?.();
    } catch {}
    // Detach any listeners/observers that may have been attached to the container by the editor wrapper
    try {
      const c: any = container as any;
      const onMove = c?.__onMove; if (onMove) { try { c.removeEventListener('mousemove', onMove); } catch {} }
      const onLeave = c?.__onLeave; if (onLeave) { try { c.removeEventListener('mouseleave', onLeave); } catch {} }
      if (onMove) { try { delete c.__onMove; } catch {} }
      if (onLeave) { try { delete c.__onLeave; } catch {} }
      const ro = c?.__scaleRO; if (ro && ro.disconnect) { try { ro.disconnect(); } catch {} }
      if (ro) { try { delete c.__scaleRO; } catch {} }
      const onWin = c?.__onWin; if (onWin) { try { window.removeEventListener('resize', onWin); } catch {} }
      if (onWin) { try { delete c.__onWin; } catch {} }
      const rafId = c?.__scaleRAF; if (rafId) { try { cancelAnimationFrame(rafId); } catch {} }
      if (rafId) { try { delete c.__scaleRAF; } catch {} }
    } catch {}
  };

  return {
    // Soft dispose: keep BGM/music, stop only SFX
    dispose() {
      (executor as any)?.abort?.();
      try { (audioManager as any)?.stopAllSounds?.(); } catch {}
      commonTearDown();
    },
    // Hard dispose: stop everything including BGM/music
    hardDispose() {
      (executor as any)?.abort?.();
      try { (audioManager as any)?.stopAll?.(); } catch {}
      commonTearDown();
    },
    executor,
    app,
    setViewScale,
    eventManager,
    stateManager
  };
}
