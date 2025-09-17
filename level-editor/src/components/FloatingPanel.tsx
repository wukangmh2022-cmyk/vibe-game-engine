import React, { useState, useRef, useEffect } from 'react';
import './FloatingPanel.css';

interface PanelState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  z: number;
  previousState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface FloatingPanelProps {
  id: string;
  title: string;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  children: React.ReactNode;
  className?: string;
  onStateChange?: (state: PanelState) => void;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  id,
  title,
  defaultX = 50,
  defaultY = 50,
  defaultWidth = 400,
  defaultHeight = 500,
  minWidth = 200,
  minHeight = 150,
  children,
  className = '',
  onStateChange
}) => {
  // global z-index counter to ensure last-focused panel is on top
  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  const zGlobal = (FloatingPanel as any).__zTop = (FloatingPanel as any).__zTop || 300;
  const nextZ = () => ((FloatingPanel as any).__zTop = ((FloatingPanel as any).__zTop || 300) + 1);

  const [state, setState] = useState<PanelState>({
    x: defaultX,
    y: defaultY,
    width: defaultWidth,
    height: defaultHeight,
    isMinimized: false,
    isMaximized: false,
    z: zGlobal + 1
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Debug layout logs (toggle via localStorage.DEBUG_LAYOUT = '1')
  useEffect(() => {
    const debug = typeof window !== 'undefined' && localStorage.getItem('DEBUG_LAYOUT') === '1';
    if (!debug) return;
    const log = () => {
      try {
        const pb = panelRef.current?.getBoundingClientRect();
        const hb = headerRef.current?.getBoundingClientRect();
        const content = panelRef.current?.querySelector('.panel-content') as HTMLElement | null;
        const cb = content?.getBoundingClientRect();
        console.info('[FP] sizes', {
          panel: pb ? { w: Math.round(pb.width), h: Math.round(pb.height) } : null,
          header: hb ? { h: Math.round(hb.height) } : null,
          content: cb ? { h: Math.round(cb.height), scrollH: content?.scrollHeight } : null
        });
      } catch {}
    };
    log();
    const RO = (window as any).ResizeObserver;
    let ro: any = null;
    if (RO) {
      ro = new RO(log);
      if (panelRef.current) ro.observe(panelRef.current);
    }
    window.addEventListener('resize', log);
    return () => { try { ro?.disconnect?.(); window.removeEventListener('resize', log); } catch {} };
  }, []);

  // 通知父组件状态变化 - 只在特定状态变化时通知
  useEffect(() => {
    // 只有在用户交互导致的状态变化时才通知父组件
    // 避免因props更新导致的循环调用
    if (onStateChange) {
      // 使用requestAnimationFrame确保状态更新完成后再通知
      const timeoutId = setTimeout(() => {
        onStateChange(state);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [state.x, state.y, state.width, state.height, state.isMinimized, state.isMaximized]);

  // 鼠标移动事件处理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current && panelRef.current) {
        const deltaX = e.clientX - dragStartPos.current.x;
        const deltaY = e.clientY - dragStartPos.current.y;
        
        // 使用起始位置，而不是递增计算
        const newX = dragStartPos.current.startX + deltaX;
        const newY = dragStartPos.current.startY + deltaY;
        
        setState(prev => ({
          ...prev,
          x: Math.max(0, newX),
          y: Math.max(0, newY)
        }));
      }
      
      if (isResizing.current && panelRef.current) {
        const deltaX = e.clientX - resizeStartPos.current.x;
        const deltaY = e.clientY - resizeStartPos.current.y;
        
        setState(prev => ({
          ...prev,
          width: Math.max(minWidth, resizeStartPos.current.width + deltaX),
          height: Math.max(minHeight, resizeStartPos.current.height + deltaY)
        }));
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      isResizing.current = false;
      document.body.style.cursor = 'default';
      
      // 移除拖拽样式
      if (panelRef.current) {
        panelRef.current.classList.remove('dragging');
        panelRef.current.classList.remove('resizing');
      }
      
      // 更新拖拽起始位置为当前状态，确保下次拖拽正确
      if (panelRef.current) {
        dragStartPos.current = {
          x: 0,
          y: 0,
          startX: state.x,
          startY: state.y
        };
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minWidth, minHeight]);

  // 拖拽/点击任意处时置顶
  const bringToFront = () => setState(prev => ({ ...prev, z: nextZ() }));

  // 开始拖拽
  const handleDragStart = (e: React.MouseEvent) => {
    bringToFront();
    if (state.isMaximized) return;
    
    // 先更新拖拽起始位置为当前状态
    const panelRect = panelRef.current?.getBoundingClientRect();
    const currentX = panelRect ? panelRect.left : state.x;
    const currentY = panelRect ? panelRect.top : state.y;
    
    isDragging.current = true;
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      // 使用实际的面板位置
      startX: currentX,
      startY: currentY
    };
    document.body.style.cursor = 'move';
    
    // 添加拖拽开始时的视觉反馈
    if (panelRef.current) {
      panelRef.current.classList.add('dragging');
    }
  };

  // 开始调整大小
  const handleResizeStart = (e: React.MouseEvent) => {
    bringToFront();
    if (state.isMaximized) return;
    
    e.stopPropagation();
    isResizing.current = true;
    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: state.width,
      height: state.height
    };
    document.body.style.cursor = 'se-resize';
    
    // 添加调整大小时的视觉反馈
    if (panelRef.current) {
      panelRef.current.classList.add('resizing');
    }
  };

  // 最小化/最大化/还原
  const handleMinimize = () => {
    try {
      console.info('[FloatingPanel] minimize click', { id, before: { minimized: state.isMinimized, maximized: state.isMaximized, x: state.x, y: state.y, w: state.width, h: state.height, z: state.z } });
    } catch {}
    setState(prev => {
      if (prev.isMinimized) {
        const next = { ...prev, isMinimized: false };
        try { console.info('[FloatingPanel] minimize -> restore', { id, after: { minimized: next.isMinimized, x: next.x, y: next.y, w: next.width, h: next.height, z: next.z } }); } catch {}
        return next;
      } else {
        const next = { 
          ...prev, 
          isMinimized: true,
          previousState: {
            x: prev.x,
            y: prev.y,
            width: prev.width,
            height: prev.height
          }
        } as PanelState;
        try { console.info('[FloatingPanel] minimize -> minimized', { id, after: { minimized: next.isMinimized, x: next.x, y: next.y, w: next.width, h: next.height, z: next.z } }); } catch {}
        return next;
      }
    });
  };

  const handleMaximize = () => {
    try {
      console.info('[FloatingPanel] maximize click', { id, before: { minimized: state.isMinimized, maximized: state.isMaximized, x: state.x, y: state.y, w: state.width, h: state.height, z: state.z } });
    } catch {}
    setState(prev => {
      const zTop = nextZ();
      if (prev.isMaximized) {
        const next = { 
          ...prev, 
          isMaximized: false,
          ...(prev.previousState || { x: defaultX, y: defaultY, width: defaultWidth, height: defaultHeight }),
          z: zTop
        } as PanelState;
        try { console.info('[FloatingPanel] maximize -> restore', { id, after: { minimized: next.isMinimized, maximized: next.isMaximized, x: next.x, y: next.y, w: next.width, h: next.height, z: next.z } }); } catch {}
        return next;
      } else {
        const next = { 
          ...prev, 
          isMaximized: true,
          isMinimized: false,
          z: zTop,
          previousState: {
            x: prev.x,
            y: prev.y,
            width: prev.width,
            height: prev.height
          }
        } as PanelState;
        try { console.info('[FloatingPanel] maximize -> maximized', { id, after: { minimized: next.isMinimized, maximized: next.isMaximized, x: next.x, y: next.y, w: next.width, h: next.height, z: next.z } }); } catch {}
        return next;
      }
    });
  };

  // 关闭
  const handleClose = () => {
    // 可以通过回调通知父组件，或者直接隐藏
    // console.log(`Panel ${id} closed`);
  };

  const getPanelStyle = (): React.CSSProperties => {
    const baseZ = state.z || ((FloatingPanel as any).__zTop || 300);
    if (state.isMaximized) {
      return {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        zIndex: baseZ
      };
    }
    
    if (state.isMinimized) {
      return {
        top: 'auto',
        bottom: 0,
        left: state.x,
        width: state.width,
        height: '40px',
        zIndex: baseZ
      };
    }
    
    return {
      left: state.x,
      top: state.y,
      width: state.width,
      height: state.height,
      zIndex: baseZ
    };
  };

  return (
    <div
      ref={panelRef}
      className={`floating-panel ${className} ${state.isMinimized ? 'minimized' : ''} ${state.isMaximized ? 'maximized' : ''}`}
      style={getPanelStyle()}
      onMouseDown={bringToFront}
    >
      <div 
        ref={headerRef}
        className="panel-header"
        onMouseDown={handleDragStart}
      >
        <div className="panel-title">{title}</div>
        <div className="panel-controls">
          <button 
            className="panel-control minimize"
            onClick={handleMinimize}
            title={state.isMinimized ? "还原" : "最小化"}
          >
            {state.isMinimized ? '□' : '−'}
          </button>
          <button 
            className="panel-control maximize"
            onClick={handleMaximize}
            title={state.isMaximized ? "还原" : "最大化"}
          >
            {state.isMaximized ? '❐' : '□'}
          </button>
          <button 
            className="panel-control close"
            onClick={handleClose}
            title="关闭"
          >
            ×
          </button>
        </div>
      </div>
      
      {!state.isMinimized && (
        <>
          <div className="panel-content" style={{ flex: 1, minHeight: 0 }}>
            {children}
          </div>
          
          <div 
            className="resize-handle"
            onMouseDown={handleResizeStart}
          />
        </>
      )}
    </div>
  );
};
