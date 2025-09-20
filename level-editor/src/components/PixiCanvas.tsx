import React, { useEffect, useRef } from 'react';
import { GameCommand } from '../types';
import * as PIXI from 'pixi.js';
import './PixiCanvas.css';
// New: library-style runtime mount API (import directly to avoid bundling extras)
import { mountRuntime, MountedRuntime } from '../../../src/browser/bootstrap';

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

    // Always clear container before (re)mount
    canvasRef.current.innerHTML = '';

    // Dispose previous instance
    if (runtimeRef.current) {
      try { runtimeRef.current.dispose(); } catch {}
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
          // Reorder levels so that currentLevelId (if provided) is first
          let toMount: any = gameData;
          try {
            if (currentLevelId && Array.isArray((gameData as any)?.levels)) {
              const levels = [...(gameData as any).levels];
              const idx = levels.findIndex((lv: any) => lv?.id === currentLevelId);
              if (idx > 0) { const [lv] = levels.splice(idx, 1); levels.unshift(lv); toMount = { ...(gameData as any), levels }; }
            }
          } catch {}
          const container = canvasRef.current as HTMLElement;
          const mounted = await mountRuntime(container, toMount, { width: canvasWidth, height: canvasHeight, pixi: PIXI });
          if (cancelled) { try { mounted.dispose(); } catch {} return; }
          runtimeRef.current = mounted;
          // initial scale: explicit prop or auto-fit
          const initScale = (typeof scale === 'number') ? scale : computeAutoScale();
          applyScale(initScale);
          // observe container resize to auto-fit when no explicit scale is provided
          if (typeof scale !== 'number') {
            try {
              const RO: any = (window as any).ResizeObserver;
              if (RO) {
                const ro = new RO(() => { try { applyScale(computeAutoScale()); } catch {} });
                ro.observe(container);
                (container as any).__scaleRO = ro;
              } else {
                // fallback: listen to window resize
                const onWin = () => { try { applyScale(computeAutoScale()); } catch {} };
                window.addEventListener('resize', onWin);
                (container as any).__onWin = onWin;
              }
            } catch {}
          }
          // Handle scene redirects coming from runtime
          (window as any).__PIXICANVAS_REDIRECT__ = async (urlOrData: any) => {
            try {
              const base: string = (window as any).__ASSET_BASE__ || '/00project/';
              let data: any = urlOrData;
              if (typeof urlOrData === 'string') {
                // 支持本地文件夹工程：使用 __LOCAL_FILES__ 读取场景 JSON
                const localFiles: Map<string, File> | undefined = (window as any).__LOCAL_FILES__;
                const relRaw = String(urlOrData || '');
                const rel1 = relRaw.replace(/^\.\//, '').replace(/^\/+/, '');
                const tryPaths = [rel1, rel1.startsWith('scene/') ? rel1 : (`scene/${rel1}`)];
                if (localFiles) {
                  // Try both variants inside local folder mapping
                  const key = tryPaths.find(p => localFiles.has(p));
                  if (!key) throw new Error(`[redirect] scene not found in local project: ${relRaw}`);
                  const f = localFiles.get(key)!;
                  const text = await f.text();
                  const json = JSON.parse(text);
                  // 重写资源为 blob:// URL
                  try {
                    const groups = ['images','audios','animations','videos'];
                    const res = json?.resources || {};
                    for (const g of groups) {
                      const arr = Array.isArray(res[g]) ? res[g] : [];
                      for (const item of arr) {
                        const src: string = item.src || item.url;
                        if (typeof src === 'string') {
                          const key = src.replace(/^\.\//,'');
                          const file = localFiles.get(key) || localFiles.get(`/${key}`) || localFiles.get(key.replace(/^\/+/, ''));
                          if (file) item.src = URL.createObjectURL(file);
                        }
                      }
                    }
                  } catch {}
                  data = json;
                } else {
                  const u = (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(relRaw) || relRaw.startsWith('/'))
                    ? urlOrData
                    : (base.endsWith('/') ? (base + rel1) : (base + '/' + rel1));
                  console.info('[PixiCanvas] redirect fetch', u);
                  const res = await fetch(u);
                  data = await res.json();
                }
              }
              // re-mount
              const prev = runtimeRef.current; runtimeRef.current = null;
              if (prev) { try { prev.dispose(); } catch {} }
              if (canvasRef.current) canvasRef.current.innerHTML = '';
              const container2 = canvasRef.current as HTMLElement;
              const mounted2 = await mountRuntime(container2, data, { width: canvasWidth, height: canvasHeight, pixi: PIXI });
              runtimeRef.current = mounted2;
              const s2 = (typeof scale === 'number') ? scale : computeAutoScale();
              applyScale(s2);
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
      // Dispose mounted runtime on unmount to stop audio and free GPU
      try { runtimeRef.current?.dispose?.(); } catch {}
      runtimeRef.current = null;
      // Detach resize observers if any
      try {
        const container = canvasRef.current as any;
        const ro = container?.__scaleRO; if (ro && ro.disconnect) ro.disconnect();
        if (container) { delete container.__scaleRO; }
        const onWin = container?.__onWin; if (onWin) window.removeEventListener('resize', onWin);
        if (container) { delete container.__onWin; }
      } catch {}
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
      <div
        ref={canvasRef}
        className="pixi-canvas"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#0d0d0d',
          border: '1px solid #333',
          borderRadius: 4,
          overflow: 'hidden'
        }}
      />
    </div>
  );
};
