import React, { useEffect, useRef } from 'react';
import { GameCommand } from '../types';
import { PixiRuntime } from '../runtime/PixiRuntime';
import './PixiCanvas.css';

interface PixiCanvasProps {
  commands: GameCommand[];
  selectedCommandIndex: number;
  isPlaying: boolean;
  canvasWidth?: number; // 自定义画布宽度
  canvasHeight?: number; // 自定义画布高度
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({
  commands,
  selectedCommandIndex,
  isPlaying,
  canvasWidth = 800, // 默认宽度为800
  canvasHeight = 600 // 默认高度为600
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PixiRuntime | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (canvasRef.current && !runtimeRef.current) {
      runtimeRef.current = new PixiRuntime(canvasRef.current, canvasWidth, canvasHeight);
      // 初始化一次尺寸
      const container = canvasRef.current;
      if (container) {
        runtimeRef.current.resize(canvasWidth, canvasHeight);
      }
      // 挂载 UI Bridge
      runtimeRef.current.setUiBridge({
        showChoices: (title: string, choices: string[]) => {
          return new Promise<number>((resolve) => {
            // 创建覆盖层
            const root = canvasRef.current!;
            // 清理旧的
            if (overlayRef.current) {
              root.removeChild(overlayRef.current);
            }
            const overlay = document.createElement('div');
            overlayRef.current = overlay;
            overlay.style.position = 'absolute';
            overlay.style.inset = '0';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.background = 'rgba(0,0,0,0.4)';
            overlay.style.zIndex = '10';

            const panel = document.createElement('div');
            panel.style.minWidth = '260px';
            panel.style.maxWidth = '80%';
            panel.style.background = '#fff';
            panel.style.borderRadius = '8px';
            panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.25)';
            panel.style.padding = '16px';

            const titleEl = document.createElement('div');
            titleEl.textContent = title || '请选择';
            titleEl.style.fontSize = '16px';
            titleEl.style.fontWeight = 'bold';
            titleEl.style.marginBottom = '12px';
            panel.appendChild(titleEl);

            const list = document.createElement('div');
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '8px';

            choices.forEach((c, idx) => {
              const btn = document.createElement('button');
              btn.textContent = c;
              btn.style.padding = '8px 12px';
              btn.style.borderRadius = '6px';
              btn.style.border = '1px solid #ddd';
              btn.style.background = '#f7f7f7';
              btn.style.cursor = 'pointer';
              btn.onmouseenter = () => (btn.style.background = '#efefef');
              btn.onmouseleave = () => (btn.style.background = '#f7f7f7');
              btn.onclick = () => {
                cleanup();
                resolve(idx);
              };
              list.appendChild(btn);
            });

            panel.appendChild(list);
            overlay.appendChild(panel);
            root.style.position = 'relative';
            root.appendChild(overlay);

            const cleanup = () => {
              try { overlay.remove(); } catch {}
              if (overlayRef.current === overlay) overlayRef.current = null;
            };
          });
        }
      });
    }

    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.stop();
        runtimeRef.current.destroy();
        runtimeRef.current = null;
      }
      if (overlayRef.current && canvasRef.current) {
        try { canvasRef.current.removeChild(overlayRef.current); } catch {}
        overlayRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    // 终止上一次执行
    runtime.stop();
    runtime.clearCanvas();

    const run = async () => {
      if (isPlaying) {
        // 播放模式：顺序执行全部指令
        await runtime.runCommands(commands, 0);
      } else {
        // 编辑模式：顺序执行到选中的指令（-1 视为全部）
        const endIndex = selectedCommandIndex === -1 ? undefined : selectedCommandIndex + 1;
        await runtime.runCommands(commands, 0, endIndex);
      }
    };

    run();

    // 依赖变化或组件卸载时，停止当前执行
    return () => {
      runtime.stop();
      if (overlayRef.current && canvasRef.current) {
        try { canvasRef.current.removeChild(overlayRef.current); } catch {}
        overlayRef.current = null;
      }
    };
  }, [commands, selectedCommandIndex, isPlaying]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    // 直接调用resize方法，确保尺寸变化立即生效
    runtime.resize(canvasWidth, canvasHeight);
  }, [canvasWidth, canvasHeight]); // 当画布尺寸变化时重新设置

  useEffect(() => {
    const handleResize = () => {
      if (runtimeRef.current) {
        // 使用传入的自定义画布尺寸，而不是容器尺寸
        runtimeRef.current.resize(canvasWidth, canvasHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasWidth, canvasHeight]); // 添加依赖项，当画布尺寸变化时重新设置

  return (
    <div className="pixi-canvas-container">
      <div className="canvas-header">
        <h3>游戏预览</h3>
        <div className="canvas-info">
          {isPlaying ? (
            <span className="status playing">▶️ 播放中</span>
          ) : (
            <span className="status editing">✏️ 编辑模式</span>
          )}
          {selectedCommandIndex >= 0 && (
            <span className="command-info">
              执行到第 {selectedCommandIndex + 1} 条指令
            </span>
          )}
        </div>
      </div>
      
      <div 
        ref={canvasRef} 
        className="pixi-canvas"
        style={{ 
          width: canvasWidth, 
          height: canvasHeight,
          backgroundColor: '#f0f0f0',
          border: '2px solid #ddd',
          borderRadius: '4px',
          margin: '0 auto' // 居中显示
        }}
      />
    </div>
  );
};