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
  scale?: number; // visual scale (0~1)
  resources?: Array<{ id: string; type: string; src?: string; url?: string }>;
  skins?: any;
  // 新：完整运行时 JSON（优先使用）
  gameData?: any;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({
  commands,
  selectedCommandIndex,
  baseCommands,
  overlayCommands,
  baseSelectedIndex,
  overlaySelectedIndex,
  isPlaying,
  canvasWidth = 800*0.7,
  canvasHeight = 600*0.7,
  scale = 0.7,
  resources,
  skins,
  gameData
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<MountedRuntime | null>(null);

  // Helper: apply CSS scale on the underlying canvas
  const applyCssScale = () => {
    const view = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (view) {
      view.style.transformOrigin = '0 0';
      view.style.transform = `scale(${scale})`;
      view.style.display = 'block';
    }
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
          const mounted = await mountRuntime(canvasRef.current as HTMLElement, gameData, { width: canvasWidth, height: canvasHeight, pixi: PIXI });
          if (cancelled) { try { mounted.dispose(); } catch {} return; }
          runtimeRef.current = mounted;
          applyCssScale();
          // Handle scene redirects coming from runtime
          (window as any).__PIXICANVAS_REDIRECT__ = async (urlOrData: any) => {
            try {
              const base: string = (window as any).__ASSET_BASE__ || '/00project/';
              let data: any = urlOrData;
              if (typeof urlOrData === 'string') {
                const u = (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlOrData) || urlOrData.startsWith('/'))
                  ? urlOrData
                  : (base.endsWith('/') ? (base + urlOrData.replace(/^\.\//, '')) : (base + '/' + urlOrData.replace(/^\.\//, '')));
                console.info('[PixiCanvas] redirect fetch', u);
                const res = await fetch(u);
                data = await res.json();
              }
              // re-mount
              const prev = runtimeRef.current; runtimeRef.current = null;
              if (prev) { try { prev.dispose(); } catch {} }
              if (canvasRef.current) canvasRef.current.innerHTML = '';
              const mounted2 = await mountRuntime(canvasRef.current as HTMLElement, data, { width: canvasWidth, height: canvasHeight, pixi: PIXI });
              runtimeRef.current = mounted2;
              applyCssScale();
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
  }, [gameData, isPlaying, canvasWidth, canvasHeight]);

  // cleanup redirect hook when unmounting/cancelling
  useEffect(() => {
    return () => { try { delete (window as any).__PIXICANVAS_REDIRECT__; } catch {} };
  }, []);

  // Legacy resources/skins effects are no-ops for mountRuntime path (handled internally)

  // Legacy linear preview has been removed to align with mountRuntime; keep dependency array for compatibility
  useEffect(() => { /* no-op with mountRuntime path */ }, [baseCommands, overlayCommands, baseSelectedIndex, overlaySelectedIndex, isPlaying]);

  useEffect(() => {
    const rt = runtimeRef.current;
    // If mounted, try resizing underlying Pixi app
    try { (rt as any)?.app?.renderer?.resize?.(canvasWidth, canvasHeight); } catch {}
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    const handleResize = () => {
      try {
        const app = (runtimeRef.current as any)?.app;
        app?.renderer?.resize?.(canvasWidth, canvasHeight);
        applyCssScale();
      } catch {}
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasWidth, canvasHeight]);

  // update CSS scale when props change
  useEffect(() => { applyCssScale(); }, [scale, canvasWidth, canvasHeight]);

  const scaledW = Math.round(canvasWidth * scale);
  const scaledH = Math.round(canvasHeight * scale);

  return (
    <div className="pixi-canvas-container" style={{ display: 'flex', justifyContent: 'center' }}>
      <div
        ref={canvasRef}
        className="pixi-canvas"
        style={{
          width: scaledW,
          height: scaledH,
          backgroundColor: '#0d0d0d',
          border: '1px solid #333',
          borderRadius: 4,
          overflow: 'hidden'
        }}
      />
    </div>
  );
};
