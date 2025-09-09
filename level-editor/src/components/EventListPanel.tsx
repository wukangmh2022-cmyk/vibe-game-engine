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
}

export const EventListPanel: React.FC<EventListPanelProps> = ({
  level,
  selectedEventId,
  onEventSelect,
  onOpenTriggerEditor
}) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // 从关卡数据中提取事件信息
  const extractEvents = (levelData: any): Event[] => {
    const events: Event[] = [];
    
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
      commands: levelData.commands || []
    });
    
    // 然后添加真实的事件
    if (levelData.events && Array.isArray(levelData.events)) {
      levelData.events.forEach((event: any) => {
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
      case 'timer':
        return `⏱️ 时间触发 (${trigger.delay || 0}ms)`;
      case 'custom':
        if (trigger.condition?.expression) {
          const expr = trigger.condition.expression;
          const match = expr.match(/event\.action === '(.+)'/);
          if (match) {
            return `🖱️ 按钮事件: ${match[1]}`;
          }
          return `📝 自定义条件`;
        }
        return '🖱️ 事件触发';
      default:
        if (trigger.condition?.expression) {
          const expr = trigger.condition.expression;
          const match = expr.match(/event\.action === '(.+)'/);
          if (match) {
            return `🖱️ 按钮事件: ${match[1]}`;
          }
          return `📝 自定义条件`;
        }
        return '未知触发条件';
    }
  };

  // 获取按钮事件关联信息
  const getButtonEventInfo = (commands: GameCommand[]): { hasButton: boolean; buttonAction?: string } => {
    // 查找是否有SHOW_BUTTON指令
    for (const cmd of commands) {
      if (cmd.type === 'SHOW_BUTTON' && cmd.parameters?.onClick) {
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
      <div className="panel-header">
        <h3>📋 事件列表</h3>
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
                  
                  {/* 显示指令概览 */}
                  {event.id !== 'main-flow' && (
                    <div className="event-command-summary">
                      <h4>📋 指令概览:</h4>
                      <div className="command-summary-content">
                        {event.commands.length > 0 ? (
                          <>
                            <div>指令总数: {event.commands.length}</div>
                            {(() => {
                              const buttonInfo = getButtonEventInfo(event.commands);
                              if (buttonInfo.hasButton) {
                                return <div>🖱️ 关联按钮事件: {buttonInfo.buttonAction}</div>;
                              }
                              return null;
                            })()}
                          </>
                        ) : (
                          <span>暂无指令</span>
                        )}
                      </div>
                    </div>
                  )}
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
    </div>
  );
};