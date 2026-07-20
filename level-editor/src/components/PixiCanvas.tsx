import React, { useEffect, useRef, useState } from 'react';
import { GameCommand } from '../types';
import * as PIXI from 'pixi.js';
import './PixiCanvas.css';
// New: library-style runtime mount API (import directly to avoid bundling extras)
import { mountRuntime, MountedRuntime } from '../../../src/browser/bootstrap';
import vfs from '../utils/vfs';
import { buildModifierMap, setGlobalCommandModifiers } from '../../../src/core/commandModifiers';

interface PixiCanvasProps {
  // 兼容旧 props（原始预览用法）
  commands?: GameCommand[];
  selectedCommandIndex?: number;
  // 新 props（基础 + 叠加事件）
  baseCommands?: GameCommand[];
  overlayCommands?: GameCommand[];
  baseSelectedIndex?: number;
  overlaySelectedIndex?: number;
  // 通用
  isPlaying: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  scale?: number; // optional: explicit scale; if omitted, auto-fit container
  resources?: Array<{ id: string; type: string; src?: string; url?: string }>;
  skins?: any;
  // 新：完整运行时 JSON（优先使用）
  gameData?: any;
  currentLevelId?: string;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({
  commands,
  selectedCommandIndex,
  baseCommands,
  overlayCommands,
  baseSelectedIndex,
  overlaySelectedIndex,
  isPlaying,
  canvasWidth = 800,
  canvasHeight = 600,
  scale,
  resources,
  skins,
  gameData,
  currentLevelId
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<MountedRuntime | null>(null);
  const currentDataRef = useRef<any>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  // Helper: apply CSS scale on the underlying canvas
  const applyScale = (s: number) => {
    const rt = runtimeRef.current;
    if (rt && typeof rt.setViewScale === 'function') {
      rt.setViewScale(s);
      return;
    }
    const view = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (view) {
      view.style.transformOrigin = '0 0';
      view.style.transform = `scale(${s})`;
      view.style.display = 'block';
    }
  };

  const computeAutoScale = () => {
    const el = canvasRef.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const cw = Math.max(1, canvasWidth);
    const ch = Math.max(1, canvasHeight);
    const s = Math.max(0.1, Math.min(4, Math.min(rect.width / cw, rect.height / ch)));
    return s;
  };

  // Mount runtime when using full gameData and playing; otherwise, fall back to legacy preview (no-op here)
  useEffect(() => {
    // If no container, do nothing
    if (!canvasRef.current) return;

    // Always clear container before (re)mount; disposal of listeners/observers is centralized in runtime.dispose
    canvasRef.current.innerHTML = '';

    // Dispose previous instance (hard when not playing; soft during re-mount while playing)
    if (runtimeRef.current) {
      try {
        if (!isPlaying) {
          (runtimeRef.current as any).hardDispose?.();
        } else {
          runtimeRef.current.dispose();
        }
      } catch {}
      runtimeRef.current = null;
    }

    // Only mount when we have a full game JSON and isPlaying=true
    if (gameData && isPlaying) {
      try {
        const level0 = (gameData as any)?.levels?.[0];
        const types = Array.isArray(level0?.commands) ? level0.commands.map((c: any) => c?.type).slice(0, 10) : [];
        console.info('[PixiCanvas] mounting with first commands:', types);
      } catch {}
      let cancelled = false;
      (async () => {
        try {
          // Keep level order; derive startLevelIndex from currentLevelId if provided
          let toMount: any = gameData;
          let startLevelIndex: number | undefined = undefined;
          try {
            if (currentLevelId && Array.isArray((gameData as any)?.levels)) {
              const levels = (gameData as any).levels as any[];
              const idx = Math.max(0, levels.findIndex((lv: any) => lv?.id === currentLevelId));
              if (idx >= 0) startLevelIndex = idx;
            }
          } catch {}
          // Inject project-level skins from config.json into runtime data first
          try {
            const cfg = await vfs.readJSON<any>('config.json');
            const skins = (cfg && (cfg.skins || (cfg.resources && cfg.resources.skins))) || [];
            if (Array.isArray(skins) && skins.length) {
              (toMount as any).skins = skins;
            }
          } catch {}
          // Now rewrite resource URLs (including skins) via VFS so that imported/IDB resources resolve to blob: URLs
          try { vfs.rewriteResourceURLs(toMount); } catch {}
          // Expose a VFS URL resolver for runtime (e.g., animation JSON)
          try {
            (window as any).__VFS_GET_URL__ = async (relPath: string) => {
              try { return await vfs.getURL(relPath); } catch { return undefined; }
            };
          } catch {}
          try {
            const mods = await vfs.readJSON<any>('modify.json');
            if (mods) setGlobalCommandModifiers(buildModifierMap(mods));
            else setGlobalCommandModifiers(null);
          } catch {
            setGlobalCommandModifiers(null);
          }
          const container = canvasRef.current as HTMLElement;
          const mounted = await mountRuntime(container, toMount, { width: canvasWidth, height: canvasHeight, pixi: PIXI, startLevelIndex });
          if (cancelled) { try { mounted.dispose(); } catch {} return; }
          runtimeRef.current = mounted;
          // Track current scene data for future 'this' reloads
          currentDataRef.current = toMount;
          try {
            // Expose runtime managers for editor panels
            (window as any).__RUNTIME_EVENT_MANAGER__ = mounted.eventManager;
            (window as any).__RUNTIME_STATE_MANAGER__ = mounted.stateManager;
            // Notify panels that runtime is mounted (for initial variable snapshot)
            try { window.dispatchEvent(new CustomEvent('editor:runtime_mounted')); } catch {}
            // Bridge variable/switch changes to DOM CustomEvents for React side-effects
            const em = mounted.eventManager as any;
            const relay = (name: string) => (payload: any) => {
              try { window.dispatchEvent(new CustomEvent(name, { detail: payload })); } catch {}
            };
            em.on('variable_changed', relay('editor:variable_changed'));
            em.on('switch_changed', relay('editor:switch_changed'));
            em.on('level_changed', relay('editor:level_changed'));
            em.on('state_reset', relay('editor:state_reset'));
            em.on('state_loaded', relay('editor:state_loaded'));
            em.on('command_start', (d: any) => relay('editor:runtime_command')({ id: d?.command?.id, status: 'start', command: d?.command }));
            em.on('command_complete', (d: any) => relay('editor:runtime_command')({ id: d?.command?.id, status: (d?.result?.success === false ? 'error' : 'complete'), result: d?.result, command: d?.command }));
            em.on('command_error', (d: any) => relay('editor:runtime_command')({ id: d?.command?.id, status: 'error', error: d?.error, command: d?.command }));
          } catch {}
          // mouse position overlay tracking within container
          try {
            const containerEl = canvasRef.current as HTMLElement;
            const onMove = (e: MouseEvent) => {
              try {
                const rect = containerEl.getBoundingClientRect();
                const s = (typeof scale === 'number') ? scale : computeAutoScale();
                const x = Math.round((e.clientX - rect.left) / s);
                const y = Math.round((e.clientY - rect.top) / s);
                if (x >= 0 && y >= 0 && x <= canvasWidth && y <= canvasHeight) setMouse({ x, y });
                else setMouse(null);
              } catch { setMouse(null); }
            };
            const onLeave = () => setMouse(null);
            containerEl.addEventListener('mousemove', onMove);
            containerEl.addEventListener('mouseleave', onLeave);
            (containerEl as any).__onMove = onMove; (containerEl as any).__onLeave = onLeave;
          } catch {}
          // initial scale: explicit prop or auto-fit
          const initScale = (typeof scale === 'number') ? scale : computeAutoScale();
          applyScale(initScale);
          // Clear previous scale observers if any (in case of redirect re-mount)
          try {
            const c: any = container as any;
            if (c.__scaleRO && c.__scaleRO.disconnect) { try { c.__scaleRO.disconnect(); } catch {} c.__scaleRO = null; }
            if (c.__onWin) { try { window.removeEventListener('resize', c.__onWin); } catch {} c.__onWin = null; }
            if (c.__scaleRAF) { try { cancelAnimationFrame(c.__scaleRAF); } catch {} c.__scaleRAF = null; }
          } catch {}
          // observe container resize to auto-fit when no explicit scale is provided
          if (typeof scale !== 'number') {
            try {
              const RO: any = (window as any).ResizeObserver;
              if (RO) {
                const ro = new RO(() => { try { applyScale(computeAutoScale()); } catch {} });
                ro.observe(container);
                (container as any).__scaleRO = ro;
              } else {
                // fallback: listen to window resize + RAF polling on container size changes
                const onWin = () => { try { applyScale(computeAutoScale()); } catch {} };
                window.addEventListener('resize', onWin);
                (container as any).__onWin = onWin;
                // RAF polling: detect container rect changes even without window resize
                let lastW = -1, lastH = -1;
                const rafTick = () => {
                  try {
                    const r = container.getBoundingClientRect();
                    const w = Math.round(r.width);
                    const h = Math.round(r.height);
                    if (w !== lastW || h !== lastH) {
                      lastW = w; lastH = h; applyScale(computeAutoScale());
                    }
                  } catch {}
                  (container as any).__scaleRAF = requestAnimationFrame(rafTick);
                };
                (container as any).__scaleRAF = requestAnimationFrame(rafTick);
              }
            } catch {}
          }
          // Handle scene redirects coming from runtime
          (window as any).__PIXICANVAS_REDIRECT__ = async (urlOrData: any) => {
            try {
              // Ensure only the latest redirect wins; abort earlier ones mid-flight
              const win: any = (window as any);
              const mySeq: number = (win.__REDIRECT_SEQ__ = (win.__REDIRECT_SEQ__ || 0) + 1);
              const isLatest = () => win.__REDIRECT_SEQ__ === mySeq;
              const base: string = (window as any).__ASSET_BASE__ || '/00project/';
              let data: any = urlOrData;
              // Debug info for resolved target index within target scene file
              let __dbgResolvedAbsIdx: number | undefined = undefined;
              let __dbgTargetLevelId: string | undefined = undefined;
              let __dbgSource: string = '';
              let __dbgUrl: string | undefined = undefined;
              // Runtime option: start level index to pass without reordering
              let __startLevelIndex: number | undefined = undefined;
              // Support special reload token with optional currentLevelId preservation
              if (urlOrData && typeof urlOrData === 'object' && (urlOrData.reload === true)) {
                const payload: any = urlOrData;
                const cur = currentDataRef.current || gameData;
                data = cur;
                __dbgSource = 'reload-current';
                if (cur && payload.currentLevelId) {
                  try {
                    const levels = Array.isArray((cur as any).levels) ? [ ...(cur as any).levels ] : [];
                    const idx = levels.findIndex((lv: any) => lv?.id === payload.currentLevelId);
                    if (idx >= 0) { __dbgResolvedAbsIdx = idx; __dbgTargetLevelId = payload.currentLevelId; __startLevelIndex = idx; }
                  } catch {}
                }
              } else if (typeof urlOrData === 'string') {
                const token = String(urlOrData || '').trim();
                if (token.toLowerCase() === 'this') {
                  data = currentDataRef.current || gameData;
                  try {
                    __dbgSource = 'this';
                    const rt = runtimeRef.current as any;
                    const curLevelId = rt?.stateManager?.getCurrentLevel?.();
                    if (curLevelId && Array.isArray((data as any)?.levels)) {
                      const idx = (data as any).levels.findIndex((lv: any) => lv?.id === curLevelId);
                      if (idx >= 0) { __dbgResolvedAbsIdx = idx; __dbgTargetLevelId = curLevelId; __startLevelIndex = idx; }
                    }
                  } catch {}
                } else {
                  const relRaw = String(urlOrData || '');
                  const rel1 = relRaw.replace(/^\.\//, '').replace(/^\/+/, '');
                  // Try VFS first
                  const fromVfs = await vfs.readScene(rel1.startsWith('scene/') ? rel1 : `scene/${rel1}`);
                  if (fromVfs) {
                    try { vfs.rewriteResourceURLs(fromVfs); } catch {}
                    data = fromVfs;
                  } else {
                    const u = (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(relRaw) || relRaw.startsWith('/'))
                      ? urlOrData
                      : (base.endsWith('/') ? (base + rel1) : (base + '/' + rel1));
                    { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[PixiCanvas] redirect fetch', u); }
                    const res = await fetch(u);
                    data = await res.json();
                  }
                  __dbgSource = 'url:string';
                  __dbgUrl = rel1;
                }
              } else if (urlOrData && typeof urlOrData === 'object' && (urlOrData.url || urlOrData.data)) {
                // Object form: { url, levelIndex? } or { data, levelIndex? }
                const obj: any = urlOrData;
                if (obj.data) {
                  data = obj.data;
                } else if (obj.url) {
                  if (obj.url && typeof obj.url === 'object') {
                    // Editor handoff: raw scene object passed in url field
                    data = obj.url;
                  } else {
                  const relRaw = String(obj.url || '');
                  const rel1 = relRaw.replace(/^\.\//, '').replace(/^\/+/, '');
                  const fromVfs = await vfs.readScene(rel1.startsWith('scene/') ? rel1 : `scene/${rel1}`);
                  if (fromVfs) {
                    try { vfs.rewriteResourceURLs(fromVfs); } catch {}
                    data = fromVfs;
                  } else {
                    const u = (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(relRaw) || relRaw.startsWith('/'))
                      ? obj.url
                      : (base.endsWith('/') ? (base + rel1) : (base + '/' + rel1));
                    { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[PixiCanvas] redirect fetch', u); }
                    const res = await fetch(u);
                    data = await res.json();
                  }
                  __dbgUrl = rel1;
                  }
                }
                // Apply target levelIndex if provided
                const li = (typeof obj.levelIndex === 'number') ? obj.levelIndex : (obj.levelIndex != null ? Number(obj.levelIndex) : undefined);
                if (data && Array.isArray((data as any).levels) && typeof li === 'number' && li >= 0 && li < ((data as any).levels as any[]).length) {
                  __dbgSource = 'object';
                  __dbgResolvedAbsIdx = li;
                  try { __dbgTargetLevelId = (data as any).levels?.[li]?.id; } catch {}
                  __startLevelIndex = li; // no reordering; pass index to runtime
                }
              } else if (urlOrData && typeof urlOrData === 'object') {
                // Raw scene object: may include __originalLevels + __currentOriginalIndex
                __dbgSource = 'object:raw';
                try {
                  const explicitIdx = (urlOrData as any)?.levelIndex;
                  const abs = (typeof explicitIdx === 'number') ? explicitIdx : (urlOrData as any)?.__currentOriginalIndex;
                  if (typeof abs === 'number') {
                    __dbgResolvedAbsIdx = abs;
                    try { __dbgTargetLevelId = (urlOrData as any)?.__originalLevels?.[abs]?.id; } catch {}
                    __startLevelIndex = abs;
                  } else {
                    const firstId = (urlOrData as any)?.levels?.[0]?.id;
                    if (firstId && Array.isArray((urlOrData as any)?.__originalLevels)) {
                      const found = (urlOrData as any).__originalLevels.findIndex((lv: any) => lv?.id === firstId);
                      if (found >= 0) { __dbgResolvedAbsIdx = found; __dbgTargetLevelId = firstId; __startLevelIndex = found; }
                    } else if (Array.isArray((urlOrData as any)?.levels)) {
                      // fallback: derive from levels array only
                      __dbgResolvedAbsIdx = 0;
                      try { __dbgTargetLevelId = (urlOrData as any)?.levels?.[0]?.id; } catch {}
                      __startLevelIndex = 0;
                    }
                  }
                } catch {}
              }
              // After data prepared, log final absolute target index within the target scene file
              try {
                const total = Array.isArray((data as any)?.levels) ? (data as any).levels.length : undefined;
                if (typeof __dbgResolvedAbsIdx !== 'number' && typeof total === 'number' && total >= 1) {
                  __dbgResolvedAbsIdx = 0;
                  try { __dbgTargetLevelId = (data as any).levels?.[0]?.id; } catch {}
                }
                const logIdx = (typeof __dbgResolvedAbsIdx === 'number') ? __dbgResolvedAbsIdx : 0;
                const logSceneId = (data as any)?.id;
                let logLevelId: any = __dbgTargetLevelId;
                if (!logLevelId) { try { logLevelId = (data as any)?.levels?.[logIdx]?.id; } catch {} }
                console.info('[redirect]', { sceneId: logSceneId, levelIndex: logIdx, levelId: logLevelId });
              } catch {}
              // If another redirect was requested during async work, abort this one
              if (!isLatest()) { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[PixiCanvas] redirect aborted (newer redirect in flight)'); return; }
              // Inject project-level skins from config.json before remount
              try {
                const cfg = await vfs.readJSON<any>('config.json');
                const skins = (cfg && (cfg.skins || (cfg.resources && cfg.resources.skins))) || [];
                if (Array.isArray(skins) && skins.length) {
                  (data as any).skins = skins;
                }
              } catch {}
              // Ensure resource URLs (including skins) are rewritten to blob:/local URLs when using VFS
              try { vfs.rewriteResourceURLs(data); } catch {}
              // re-mount
              if (!isLatest()) { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[PixiCanvas] redirect aborted before remount (newer redirect)'); return; }
              const prev = runtimeRef.current; runtimeRef.current = null;
              // Soft dispose on redirect to preserve BGM across scenes
              if (prev) { try { prev.dispose(); } catch {} }
              if (canvasRef.current) canvasRef.current.innerHTML = '';
              const container2 = canvasRef.current as HTMLElement;
              const mounted2 = await mountRuntime(container2, data, { width: canvasWidth, height: canvasHeight, pixi: PIXI, startLevelIndex: __startLevelIndex });
              if (!isLatest()) { const dbg = (globalThis as any)?.localStorage?.getItem?.('DEBUG_RUNTIME')==='1'; if (dbg) console.info('[PixiCanvas] redirect aborted after remount (newer redirect)'); try { (mounted2 as any)?.hardDispose?.(); } catch {} return; }
              runtimeRef.current = mounted2;
              // update current scene data ref after redirect
              currentDataRef.current = data;
              const s2 = (typeof scale === 'number') ? scale : computeAutoScale();
              applyScale(s2);
          try {
            (window as any).__RUNTIME_EVENT_MANAGER__ = mounted2.eventManager;
            (window as any).__RUNTIME_STATE_MANAGER__ = mounted2.stateManager;
            window.dispatchEvent(new CustomEvent('editor:runtime_mounted'));
          } catch {}
        } catch (e) {
          console.warn('[PixiCanvas] redirect failed', e);
        }
      };
        } catch (e) {
          console.error('[PixiCanvas] mountRuntime failed:', e);
        }
      })();
      return () => { cancelled = true; };
    }

    // No runtime mounted in non-playing mode when using new API
  }, [gameData, isPlaying, canvasWidth, canvasHeight, currentLevelId]);

  // cleanup redirect hook when unmounting/cancelling
  useEffect(() => {
    return () => {
      try { delete (window as any).__PIXICANVAS_REDIRECT__; } catch {}
      // Hard dispose on unmount to stop BGM and free GPU
      try { (runtimeRef.current as any)?.hardDispose?.(); } catch {}
      runtimeRef.current = null;
      // Clear global bridges to allow GC
      try { delete (window as any).__RUNTIME_EVENT_MANAGER__; } catch {}
      try { delete (window as any).__RUNTIME_STATE_MANAGER__; } catch {}
      try { delete (window as any).__VFS_GET_URL__; } catch {}
      // Container-level listeners/observers are cleaned in runtime.dispose
    };
  }, []);

  // Legacy resources/skins effects are no-ops for mountRuntime path (handled internally)

  // Legacy linear preview has been removed to align with mountRuntime; keep dependency array for compatibility
  useEffect(() => { /* no-op with mountRuntime path */ }, [baseCommands, overlayCommands, baseSelectedIndex, overlaySelectedIndex, isPlaying]);

  useEffect(() => {
    const rt = runtimeRef.current;
    // If mounted, try resizing underlying Pixi app and recompute auto scale if needed
    try { (rt as any)?.app?.renderer?.resize?.(canvasWidth, canvasHeight); } catch {}
    if (typeof scale !== 'number') {
      try { applyScale(computeAutoScale()); } catch {}
    }
  }, [canvasWidth, canvasHeight]);

  // 移除周期性 Texture GC，避免预览时的周期抖动/卡顿

  useEffect(() => {
    const handleResize = () => {
      try {
        const app = (runtimeRef.current as any)?.app;
        app?.renderer?.resize?.(canvasWidth, canvasHeight);
        const s = (typeof scale === 'number') ? scale : computeAutoScale();
        applyScale(s);
      } catch {}
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasWidth, canvasHeight, scale]);

  // update CSS scale when props change
  useEffect(() => { if (typeof scale === 'number') applyScale(scale); }, [scale]);

  // Container fills available panel space; scaling is applied to the Pixi canvas via CSS transform

  return (
    <div className="pixi-canvas-container" style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div
          ref={canvasRef}
          className="pixi-canvas"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            backgroundColor: '#0d0d0d', border: '1px solid #333', borderRadius: 4, overflow: 'hidden'
          }}
        />
        {mouse && (
          <div style={{ position: 'absolute', right: 6, bottom: 6, padding: '2px 6px', background: 'rgba(0,0,0,0.6)', color: '#e6edf3', fontSize: 11, borderRadius: 4 }}>
            ({mouse.x}, {mouse.y})
          </div>
        )}
      </div>
    </div>
  );
};
