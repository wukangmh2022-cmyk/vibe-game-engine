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
}

export const EventListPanel: React.FC<EventListPanelProps> = ({
  level,
  selectedEventId,
  onEventSelect,
  onOpenTriggerEditor,
  onAddEvent,
  onDeleteEvent,
  onRenameEvent
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
      name: '🏃 主流程',
      triggers: [{
        type: 'system',
        condition: {
          type: 'expression',
          expression: '游戏主要逻辑流程'
        }
      }],
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
                    指令数: {event.commands.length} | 
                    触发器: {event.triggers.length}个
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
