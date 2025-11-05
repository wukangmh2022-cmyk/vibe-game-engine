import React, { useState } from 'react';
import { GameCommand, LevelConfig } from '../types';
import './EventListPanel.css';

interface Event {
  id: string;
  name: string;
  triggers: any[];
  commands: GameCommand[];
}

interface EventListPanelProps {
  level: LevelConfig;
  selectedEventId: string | null;
  onEventSelect: (eventId: string | null) => void;
  onOpenTriggerEditor: (eventId: string, triggerIndex: number, triggerData: any) => void;
  onAddEvent?: () => void;
  onDeleteEvent?: (eventId: string) => void;
  onRenameEvent?: (eventId: string, newName: string) => void;
  onPasteEvent?: (eventData: any) => void;
}

export const EventListPanel: React.FC<EventListPanelProps> = ({
  level,
  selectedEventId,
  onEventSelect,
  onOpenTriggerEditor,
  onAddEvent,
  onDeleteEvent,
  onRenameEvent,
  onPasteEvent
}) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; eventId: string } | null>(null);

  // 从关卡数据中提取事件信息
  const extractEvents = (levelData: any): Event[] => {
    const events: Event[] = [];
    const lvl: any = (levelData && typeof levelData === 'object') ? levelData : { commands: [], events: [] };
    
    // 首先添加主流程作为特殊事件
    events.push({
      id: 'main-flow',
      name: '🏃 入口流程',
      // 明确标注为“自动：立即”触发，便于面板一致显示
      triggers: [{ type: 'auto', start: 'immediate' }],
      commands: Array.isArray(lvl.commands) ? lvl.commands : []
    });
    
    // 然后添加真实的事件
    if (Array.isArray(lvl.events)) {
      lvl.events.forEach((event: any) => {
        events.push({
          id: event.id,
          name: event.name || '未命名事件',
          triggers: event.triggers || [],
          commands: event.commands || []
        });
      });
    }
    
    return events;
  };

  const events = extractEvents(level as any);

  // 统计可执行指令数量（递归进入常见子数组字段）
  const countCommands = (arr: any[]): number => {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    const walk = (cmd: any) => {
      if (!cmd || typeof cmd !== 'object') return;
      n += 1;
      const p = cmd.parameters || {};
      // 常见容器字段
      if (Array.isArray(cmd.commands)) cmd.commands.forEach(walk);
      if (Array.isArray(cmd.trueCommands)) cmd.trueCommands.forEach(walk);
      if (Array.isArray(cmd.falseCommands)) cmd.falseCommands.forEach(walk);
      // LOOP 等把子命令放在 parameters.commands
      if (Array.isArray(p.commands)) p.commands.forEach(walk);
    };
    arr.forEach(walk);
    return n;
  };

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const getTriggerDescription = (trigger: any): string => {
    if (!trigger) return '无条件';
    
    // 根据触发器类型显示不同的描述
    switch (trigger.type) {
      case 'auto':
        if ((trigger as any).start === 'immediate') return '⚡ 自动：立即';
        return '⚡ 自动';
      case 'custom':
        if ((trigger as any).target) return `🧩 自定义: ${(trigger as any).target}`;
        if (trigger.condition?.expression) {
          const expr = trigger.condition.expression;
          let m = expr.match(/event\.type\s*===\s*'([^']+)'/);
          if (!m) m = expr.match(/event\.action\s*===\s*'([^']+)'/);
          if (m) return `🧩 自定义: ${m[1]}`;
          return '🧩 自定义条件';
        }
        return '🧩 自定义';
      default:
        return '触发器';
    }
  };

  // Clipboard helpers for event copy/paste (scoped type to avoid pasting into other panels)
  const CLIP_KEY = 'vibe_editor_event_clipboard';
  const writeClipboard = (obj: any) => {
    try { localStorage.setItem(CLIP_KEY, JSON.stringify({ kind: 'vibe:event', schema: 'v1', payload: obj })); } catch {}
  };
  const readClipboard = (): any | null => {
    try {
      const raw = localStorage.getItem(CLIP_KEY); if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && o.kind === 'vibe:event' && o.payload && typeof o.payload === 'object') return o.payload;
    } catch {}
    return null;
  };

  // 获取按钮事件关联信息
  const getButtonEventInfo = (commands: GameCommand[]): { hasButton: boolean; buttonAction?: string } => {
    // 查找是否有 SHOW_BUTTON 指令（兼容大小写）
    for (const cmd of commands) {
      if (String(cmd.type).toUpperCase() === 'SHOW_BUTTON' && cmd.parameters?.onClick) {
        return { hasButton: true, buttonAction: cmd.parameters.onClick };
      }
    }
    return { hasButton: false };
  };

  // 开始编辑触发条件
  const handleEditTrigger = (eventId: string, triggerIndex: number, triggerData: any) => {
    onOpenTriggerEditor(eventId, triggerIndex, triggerData);
  };

  return (
    <div className="event-list-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #e9ecef', background: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#495057' }}>事件</div>
        {onAddEvent && (
          <button onClick={onAddEvent} style={{ fontSize: 12, padding: '4px 8px' }}>＋ 新建事件</button>
        )}
      </div>
      <div className="event-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <p>暂无事件</p>
          </div>
        ) : (
          events.map(event => (
            <div key={event.id} className="event-item">
              <div 
                className={`event-header ${
                  (event.id === 'main-flow' && selectedEventId === null) ||
                  (event.id !== 'main-flow' && selectedEventId === event.id) 
                    ? 'selected' : ''
                }`}
                onClick={() => onEventSelect(event.id === 'main-flow' ? null : event.id)}
                onDoubleClick={() => {
                  // 双击事件条，直达触发器编辑（非主流程）。优先编辑第一个触发器，没有则给出一个默认的 custom 触发器
                  if (event.id === 'main-flow') return;
                  const trig = (Array.isArray(event.triggers) && event.triggers.length) ? event.triggers[0] : { type: 'custom', target: '' };
                  handleEditTrigger(event.id, 0, trig);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, eventId: event.id });
                }}
              >
                <button
                  className="expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEventExpanded(event.id);
                  }}
                >
                  {expandedEvents.has(event.id) ? '▼' : '▶'}
                </button>
                
                <div className="event-info">
                  <div className="event-name">
                    {event.id === 'main-flow' ? '🏃 ' : '📋 '}{event.name}
                  </div>
                  <div className="event-meta">
                    指令数: {event.id === 'main-flow' ? (Array.isArray((level as any)?.commands) ? (level as any).commands.length : 0) : countCommands(event.commands)} |
                    触发: {event.id === 'main-flow' ? '⚡ 自动：立即' : (event.triggers.length ? getTriggerDescription(event.triggers[0]) : '无触发条件')}
                  </div>
                </div>
              </div>

              {expandedEvents.has(event.id) && (
                <div className="event-details">
                  <div className="event-triggers">
                    <h4>⚡ 触发条件:</h4>
                    {event.triggers.length === 0 ? (
                      <span className="no-triggers">无触发条件</span>
                    ) : (
                      event.triggers.map((trigger, index) => (
                        <div key={index} className="trigger-item">
                          <div className="trigger-display">
                            <span>{getTriggerDescription(trigger)}</span>
                            {event.id !== 'main-flow' && (
                              <button 
                                onClick={() => handleEditTrigger(event.id, index, trigger)}
                                className="edit-trigger-btn"
                                title="编辑触发条件"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="panel-footer">
        <div className="status-info">
          总计: {events.length}个事件
        </div>
      </div>

      {ctxMenu && (
        <>
          <div
            style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: '#fff', border: '1px solid #e9ecef', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 2000, overflow: 'hidden', minWidth: 140 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 复制 */}
            <div
              style={{ padding: '6px 10px', fontSize: 12, cursor: ctxMenu.eventId === 'main-flow' ? 'not-allowed' : 'pointer', color: ctxMenu.eventId === 'main-flow' ? '#adb5bd' : '#212529' }}
              onClick={() => {
                const ev = (extractEvents(level as any) || []).find(e => e.id === ctxMenu.eventId);
                if (ev && ev.id !== 'main-flow') {
                  const copy = { id: ev.id, name: ev.name, triggers: ev.triggers || [], commands: ev.commands || [] };
                  writeClipboard(copy);
                }
                setCtxMenu(null);
              }}
            >复制事件</div>
            {/* 粘贴 */}
            <div
              style={{ padding: '6px 10px', fontSize: 12, cursor: readClipboard() ? 'pointer' : 'not-allowed', color: readClipboard() ? '#212529' : '#adb5bd' }}
              onClick={() => {
                const data = readClipboard();
                if (!data) { setCtxMenu(null); return; }
                // 仅允许在事件面板粘贴事件
                try { onPasteEvent?.(data); } catch {}
                setCtxMenu(null);
              }}
            >粘贴为新事件</div>
            <div style={{ height: 1, background: '#f1f3f5' }} />
            <div
              style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
              onClick={() => {
                const ev = (extractEvents(level as any) || []).find(e => e.id === ctxMenu.eventId);
                const oldName = ev?.name || '';
                try {
                  const v = window.prompt('重命名事件', oldName);
                  if (v && v.trim()) onRenameEvent?.(ctxMenu.eventId, v.trim());
                } catch {}
                setCtxMenu(null);
              }}
            >重命名</div>
            <div style={{ height: 1, background: '#f1f3f5' }} />
            <div
              style={{ padding: '6px 10px', fontSize: 12, cursor: ctxMenu.eventId === 'main-flow' ? 'not-allowed' : 'pointer', color: ctxMenu.eventId === 'main-flow' ? '#adb5bd' : '#dc3545' }}
              onClick={() => { if (ctxMenu.eventId !== 'main-flow') onDeleteEvent?.(ctxMenu.eventId); setCtxMenu(null); }}
            >删除</div>
          </div>
          <div onClick={() => setCtxMenu(null)} onContextMenu={(e)=>{ e.preventDefault(); setCtxMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1999 }} />
        </>
      )}
    </div>
  );
};
