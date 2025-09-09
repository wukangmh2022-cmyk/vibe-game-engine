import React, { useState, useEffect } from 'react';
import { GameCommand, CommandType } from '../types';
import { COMMAND_TEMPLATES } from '../utils/commandTemplates';
import './CommandEditor.css';

interface CommandEditorProps {
  command: GameCommand | null;
  isOpen: boolean;
  onSave: (command: GameCommand) => void;
  onCancel: () => void;
}

export const CommandEditor: React.FC<CommandEditorProps> = ({
  command,
  isOpen,
  onSave,
  onCancel
}) => {
  const [editedCommand, setEditedCommand] = useState<GameCommand | null>(null);

  useEffect(() => {
    if (command) {
      setEditedCommand({ ...command });
    }
  }, [command]);

  if (!isOpen || !editedCommand) {
    return null;
  }

  const template = COMMAND_TEMPLATES.find(t => t.type === editedCommand.type);
  if (!template) {
    return null;
  }

  const handleParameterChange = (key: string, value: any) => {
    setEditedCommand(prev => {
      if (!prev) return null;
      return {
        ...prev,
        parameters: {
          ...prev.parameters,
          [key]: value
        }
      };
    });
  };

  const handleSave = () => {
    if (editedCommand) {
      onSave(editedCommand);
    }
  };

  const renderParameterInput = (paramKey: string, paramConfig: any) => {
    const value = editedCommand.parameters[paramKey];
    
    switch (paramConfig.type) {
      case 'string':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleParameterChange(paramKey, e.target.value)}
            placeholder={paramConfig.description}
            className="param-input"
          />
        );
      
      case 'number':
        return (
          <input
            type="number"
            value={value || 0}
            onChange={(e) => handleParameterChange(paramKey, Number(e.target.value))}
            placeholder={paramConfig.description}
            className="param-input"
            min={paramConfig.min}
            max={paramConfig.max}
            step={paramConfig.step || 1}
          />
        );
      
      case 'boolean':
        return (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handleParameterChange(paramKey, e.target.checked)}
              className="param-checkbox"
            />
            <span className="checkbox-text">{paramConfig.description}</span>
          </label>
        );
      
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => handleParameterChange(paramKey, e.target.value)}
            className="param-select"
          >
            <option value="">请选择...</option>
            {paramConfig.options?.map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      
      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handleParameterChange(paramKey, e.target.value)}
            placeholder={paramConfig.description}
            className="param-textarea"
            rows={3}
          />
        );
      
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleParameterChange(paramKey, e.target.value)}
            placeholder={paramConfig.description}
            className="param-input"
          />
        );
    }
  };

  return (
    <div className="command-editor-overlay">
      <div className="command-editor-backdrop" onClick={onCancel} />
      <div className="command-editor-modal">
        <div className="editor-header">
          <h3>编辑指令: {template.name}</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        
        <div className="editor-content">
          <div className="command-info">
            <p className="command-description">{template.description}</p>
          </div>
          
          <div className="parameters-section">
            <h4>参数设置</h4>
            <div className="parameters-grid">
              {Object.entries(template.parameters).map(([key, config]) => (
                <div key={key} className="parameter-row">
                  <label className="parameter-label">
                    {config.name}
                    {config.required && <span className="required">*</span>}
                  </label>
                  <div className="parameter-input">
                    {renderParameterInput(key, config)}
                  </div>
                  {config.description && (
                    <div className="parameter-hint">{config.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="editor-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
};