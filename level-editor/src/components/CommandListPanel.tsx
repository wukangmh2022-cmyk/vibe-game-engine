import React, { useState, useRef } from 'react';
import { GameCommand, CommandType, GameProject } from '../types';
import { COMMAND_TEMPLATES, createNewCommand } from '../utils/commandTemplates';
import { CommandEditor } from './CommandEditor';
import { CommandParameterEditor } from './CommandParameterEditor';
import './CommandListPanel.css';

interface CommandListPanelProps {
  commands: GameCommand[];
  selectedIndex: number;
  project?: GameProject | null;
  onCommandsChange: (commands: GameCommand[]) => void;
  onCommandSelect: (index: number) => void;
}

export const CommandListPanel: React.FC<CommandListPanelProps> = ({
  commands,
  selectedIndex,
  project,
  onCommandsChange,
  onCommandSelect
}: CommandListPanelProps) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [showCommandSelector, setShowCommandSelector] = useState(false);
  const [editingCommand, setEditingCommand] = useState<GameCommand | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [showParameterEditor, setShowParameterEditor] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<GameCommand | null>(null);
  
  const dragCounter = useRef(0);

  // 添加新指令
  const handleAddCommand = () => {
    setShowCommandSelector(true);
  };

  // 选择指令类型并打开编辑器
  const handleSelectCommandType = (commandType: CommandType) => {
    const newCommand = createNewCommand(commandType);
    setEditingCommand(newCommand);
    setEditingIndex(-1); // -1 表示新建指令
    setShowCommandSelector(false);
    setShowParameterEditor(true);
  };

  // 删除指令
  const handleDeleteCommand = (index: number) => {
    const newCommands = [...commands];
    newCommands.splice(index, 1);
    onCommandsChange(newCommands);
  };

  // 复制指令
  const handleCopyCommand = (index: number) => {
    setCopiedCommand(commands[index]);
  };

  // 粘贴指令
  const handlePasteCommand = (index: number) => {
    if (!copiedCommand) return;
    
    const newCommand = {
      ...copiedCommand,
      id: `${copiedCommand.id}_copy_${Date.now()}`
    };
    
    const newCommands = [...commands];
    newCommands.splice(index + 1, 0, newCommand);
    onCommandsChange(newCommands);
  };

  // 编辑指令
  const handleEditCommand = (index: number) => {
    const command = commands[index];
    const template = COMMAND_TEMPLATES.find(t => t.type === command.type);
    
    if (template && template.requiresParameterEditor) {
      setEditingCommand(command);
      setEditingIndex(index);
      setShowParameterEditor(true);
    } else {
      // 直接编辑简单指令的参数
      handleDoubleClick(command, index);
    }
  };

  // 双击编辑
  const handleDoubleClick = (command: GameCommand, index: number) => {
    setEditingCommand(command);
    setEditingIndex(index);
    setShowParameterEditor(true);
  };

  // 保存编辑
  const handleSaveCommand = (command: GameCommand) => {
    if (editingIndex === -1) {
      // 新建指令
      onCommandsChange([...commands, command]);
    } else {
      // 编辑现有指令
      const newCommands = [...commands];
      newCommands[editingIndex] = command;
      onCommandsChange(newCommands);
    }
    setEditingCommand(null);
    setShowParameterEditor(false);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingCommand(null);
    setShowParameterEditor(false);
  };

  // 保存参数编辑
  const handleSaveEdit = (params: any) => {
    if (editingCommand) {
      const updatedCommand = {
        ...editingCommand,
        parameters: params
      };
      
      if (editingIndex === -1) {
        onCommandsChange([...commands, updatedCommand]);
      } else {
        const newCommands = [...commands];
        newCommands[editingIndex] = updatedCommand;
        onCommandsChange(newCommands);
      }
    }
    setEditingCommand(null);
    setShowParameterEditor(false);
  };

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    setDraggedIndex(index);
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
    dragCounter.current = 0;
  };

  // 拖拽进入
  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragCounter.current++;
    setDropTargetIndex(index);
  };

  // 拖拽离开
  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDropTargetIndex(null);
    }
  };

  // 拖拽悬停
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // 放置
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const newCommands = [...commands];
    const [movedCommand] = newCommands.splice(draggedIndex, 1);
    newCommands.splice(dropIndex, 0, movedCommand);
    
    onCommandsChange(newCommands);
    setDraggedIndex(null);
    setDropTargetIndex(null);
    dragCounter.current = 0;
  };

  // 格式化指令参数
  const formatCommandParams = (command: GameCommand): string => {
    const params = command.parameters;
    if (!params || Object.keys(params).length === 0) return '';
    
    const entries = Object.entries(params).map(([key, value]) => {
      const formattedValue = typeof value === 'string' ? `"${value}"` : String(value);
      return `${key}: ${formattedValue}`;
    });
    
    return entries.join(', ');
  };

  // 获取指令类型的中文名称
  const getCommandTypeName = (type: CommandType): string => {
    const template = COMMAND_TEMPLATES.find(t => t.type === type);
    return template ? template.name : type;
  };

  // 简化过滤逻辑 - 由于移除了搜索和分类，直接返回所有指令
  const filteredCommands = commands;

  return (
    <div className="command-list-panel">
      <div className="panel-header">
        <h3>指令列表</h3>
        <button className="add-command-btn" onClick={handleAddCommand}>
          + 添加指令
        </button>
      </div>
      
      {showCommandSelector && (
        <div className="command-selector">
          <div className="selector-backdrop" onClick={() => setShowCommandSelector(false)} />
          <div className="selector-menu">
            <div className="selector-header">
              <h4>选择指令类型</h4>
              <button 
                className="close-btn"
                onClick={() => setShowCommandSelector(false)}
              >
                ×
              </button>
            </div>
            <div className="command-commands">
              {COMMAND_TEMPLATES.map((template) => (
                <button
                  key={template.type}
                  className="command-type-btn"
                  onClick={() => handleSelectCommandType(template.type)}
                >
                  <span className="type-name">{template.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <div className="command-list">
        {filteredCommands.length === 0 ? (
          <div className="empty-state">
            <p>暂无指令</p>
            <button className="add-command-btn" onClick={handleAddCommand}>
              添加第一个指令
            </button>
          </div>
        ) : (
          <div className="commands-grid">
            {filteredCommands.map((command: GameCommand, originalIndex: number) => {
              const index = commands.indexOf(command);
              const template = COMMAND_TEMPLATES.find(t => t.type === command.type);
              return (
                <div key={command.id} className="command-wrapper">
                  {dropTargetIndex === index && (
                    <div className="drop-placeholder active" />
                  )}
                  
                  <div
                    className={`command-item compact ${
                      selectedIndex === index ? 'selected' : ''
                    } ${
                      draggedIndex === index ? 'dragging' : ''
                    } ${
                      command.eventSource ? 'branch-command' : ''
                    } ${
                      command.type === 'EVENT_GROUP' ? 'event-group' : ''
                    }`}
                    draggable
                    onClick={() => onCommandSelect(index)}
                    onDoubleClick={() => handleDoubleClick(command, index)}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    style={{ 
                      borderLeftColor: template?.color || '#ccc',
                      marginLeft: `${(command.depth || 0) * 20}px`,
                      // 添加CSS变量以便响应式布局使用
                      '--depth': command.depth || 0,
                    } as React.CSSProperties}
                  >
                    <div className="command-main">
                      <div className="command-icon-wrapper">
                        <span className="command-icon">{template?.icon || '📝'}</span>
                        <span className="command-index">{index + 1}</span>
                      </div>
                      
                      <div className="command-content">
                        <div className="command-title">
                          {getCommandTypeName(command.type)}
                        </div>
                        <div className="command-params-preview">
                          {formatCommandParams(command)}
                        </div>
                      </div>
                      
                      <div className="command-actions">
                        <button 
                          className="action-btn edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditCommand(index);
                          }}
                          title="编辑参数"
                        >
                          ✏️
                        </button>
                        <button 
                          className="action-btn copy"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCommand(index);
                          }}
                          title="复制指令"
                        >
                          📋
                        </button>
                        {copiedCommand && (
                          <button 
                            className="action-btn paste"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePasteCommand(index);
                            }}
                            title="粘贴指令"
                          >
                            📄
                          </button>
                        )}
                        <button 
                          className="action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCommand(index);
                          }}
                          title="删除指令"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    
                    <div className="drag-handle">⋮⋮</div>
                  </div>
                  
                  {dropTargetIndex === commands.length && index === commands.length - 1 && (
                    <div className="drop-placeholder active" />
                  )}
                </div>
              );
            })}
            
            {/* 在最后一个指令后面添加+按钮 */}
            {filteredCommands.length > 0 && (
              <div className="add-button-wrapper">
                <button 
                  className="add-button-inline"
                  onClick={handleAddCommand}
                  title="添加新指令"
                  style={{
                    '--depth': 0, // 内联+按钮默认在最外层
                    marginLeft: 0
                  } as React.CSSProperties}
                >
                  +
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      <CommandEditor
        command={editingCommand}
        isOpen={editingCommand !== null && !showParameterEditor}
        onSave={handleSaveCommand}
        onCancel={handleCancelEdit}
      />
      
      {showParameterEditor && editingCommand && (
        <CommandParameterEditor
          template={COMMAND_TEMPLATES.find(t => t.type === editingCommand.type)!}
          initialParams={editingCommand.parameters}
          project={project}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      )}
    </div>
  );
};