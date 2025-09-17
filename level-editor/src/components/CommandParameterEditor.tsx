import React, { useState, useEffect } from 'react';
import { CommandTemplate, CommandParameterDef, GameProject } from '../types';
import './CommandParameterEditor.css';

interface CommandParameterEditorProps {
  template: CommandTemplate;
  initialParams: Record<string, any>;
  project?: GameProject | null;
  onSave: (params: Record<string, any>) => void;
  onCancel: () => void;
}

export const CommandParameterEditor: React.FC<CommandParameterEditorProps> = ({
  template,
  initialParams,
  project,
  onSave,
  onCancel
}) => {
  const [params, setParams] = useState<Record<string, any>>(initialParams);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setParams(initialParams);
  }, [initialParams]);

  // 从项目中提取变量和开关列表
  const getVariableOptions = () => {
    if (!project?.globalVariables) return [];
    return Object.keys(project.globalVariables).map(key => ({
      value: key,
      label: `${key} (${typeof project.globalVariables![key]})`
    }));
  };

  const getSwitchOptions = () => {
    if (!project?.globalSwitches) return [];
    return Object.keys(project.globalSwitches).map(key => ({
      value: key,
      label: `${key} (${project.globalSwitches![key] ? '开' : '关'})`
    }));
  };

  const getResourceOptions = () => {
    if (!project?.resources) return [];
    return project.resources.map(resource => ({
      value: resource.id,
      label: `${resource.name || resource.id} (${resource.type})`
    }));
  };

  const handleParamChange = (paramName: string, value: any) => {
    setParams(prev => ({ ...prev, [paramName]: value }));
    // Clear error when user starts typing
    if (errors[paramName]) {
      setErrors(prev => ({ ...prev, [paramName]: '' }));
    }
  };

  const validateParams = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    template.parameters.forEach(param => {
      const value = params[param.name];
      
      // Check required parameters
      if (param.required && (value === undefined || value === null || value === '')) {
        newErrors[param.name] = `${param.label || param.name} 是必填项`;
      }
      
      // Check number ranges
      if (param.type === 'number' && value !== undefined && value !== '') {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          newErrors[param.name] = '请输入有效数字';
        } else {
          if (param.min !== undefined && numValue < param.min) {
            newErrors[param.name] = `值不能小于 ${param.min}`;
          }
          if (param.max !== undefined && numValue > param.max) {
            newErrors[param.name] = `值不能大于 ${param.max}`;
          }
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateParams()) {
      onSave(params);
    }
  };

  const renderParameterInput = (param: CommandParameterDef) => {
    const value = params[param.name] || '';
    const error = errors[param.name];
    
    const commonProps = {
      id: param.name,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => 
        handleParamChange(param.name, e.target.value),
      placeholder: param.placeholder,
      className: `param-input ${error ? 'error' : ''}`
    };

    switch (param.type) {
      case 'text':
        return (
          <input
            type="text"
            {...commonProps}
          />
        );
        
      case 'textarea':
        return (
          <textarea
            {...commonProps}
            rows={3}
          />
        );
        
      case 'number':
        return (
          <input
            type="number"
            {...commonProps}
            min={param.min}
            max={param.max}
            step={param.type === 'number' ? 1 : undefined}
          />
        );
        
      case 'boolean':
        return (
          <select
            {...commonProps}
            value={value.toString()}
            onChange={(e) => handleParamChange(param.name, e.target.value === 'true')}
          >
            <option value="false">否</option>
            <option value="true">是</option>
          </select>
        );
        
      case 'color':
        return (
          <div className="color-input-wrapper">
            <input
              type="color"
              {...commonProps}
              className="color-picker"
            />
            <input
              type="text"
              {...commonProps}
              className="color-text"
              placeholder="#ffffff"
            />
          </div>
        );
        
      case 'select':
        return (
          <select {...commonProps}>
            <option value="">请选择...</option>
            {param.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
        
      case 'variable':
        const variableOptions = getVariableOptions();
        return (
          <div className="variable-selector">
            <select
              {...commonProps}
              className="variable-dropdown"
            >
              <option value="">请选择变量...</option>
              {variableOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {variableOptions.length === 0 && (
              <div className="no-options-hint">暂无可用变量，请先在变量管理中添加</div>
            )}
          </div>
        );

      case 'switch':
        const switchOptions = getSwitchOptions();
        return (
          <div className="switch-selector">
            <select
              {...commonProps}
              className="switch-dropdown"
            >
              <option value="">请选择开关...</option>
              {switchOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {switchOptions.length === 0 && (
              <div className="no-options-hint">暂无可用开关，请先在开关管理中添加</div>
            )}
          </div>
        );
        
      case 'resource':
        const resourceOptions = getResourceOptions();
        return (
          <div className="resource-selector">
            <select
              {...commonProps}
              className="resource-dropdown"
            >
              <option value="">请选择资源...</option>
              {resourceOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {resourceOptions.length === 0 && (
              <div className="no-options-hint">暂无可用资源，请先添加资源文件</div>
            )}
          </div>
        );
        
      case 'expression':
        return (
          <div className="condition-input">
            <select
              className="condition-type"
              value={value.type || 'variable'}
              onChange={(e) => handleParamChange(param.name, { ...value, type: e.target.value })}
            >
              <option value="variable">变量条件</option>
              <option value="switch">开关条件</option>
              <option value="script">脚本表达式</option>
            </select>
            
            {value.type === 'variable' && (
              <div className="variable-condition">
                <select
                  className="variable-name"
                  value={value.variable || ''}
                  onChange={(e) => handleParamChange(param.name, { ...value, variable: e.target.value })}
                >
                  <option value="">选择变量...</option>
                  {getVariableOptions().map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="comparison-operator"
                  value={value.operator || '=='}
                  onChange={(e) => handleParamChange(param.name, { ...value, operator: e.target.value })}
                >
                  <option value="==">等于</option>
                  <option value="!=">不等于</option>
                  <option value=">">大于</option>
                  <option value="<">小于</option>
                  <option value=">=">大于等于</option>
                  <option value="<=">小于等于</option>
                </select>
                <input
                  type="text"
                  className="comparison-value"
                  value={value.value || ''}
                  onChange={(e) => handleParamChange(param.name, { ...value, value: e.target.value })}
                  placeholder="比较值"
                />
              </div>
            )}
            
            {value.type === 'switch' && (
              <div className="switch-condition">
                <select
                  className="switch-name"
                  value={value.switch || ''}
                  onChange={(e) => handleParamChange(param.name, { ...value, switch: e.target.value })}
                >
                  <option value="">选择开关...</option>
                  {getSwitchOptions().map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="switch-state"
                  value={value.state || 'true'}
                  onChange={(e) => handleParamChange(param.name, { ...value, state: e.target.value })}
                >
                  <option value="true">开启时</option>
                  <option value="false">关闭时</option>
                </select>
              </div>
            )}
            
            {value.type === 'script' && (
              <textarea
                className="script-expression"
                value={value.expression || ''}
                onChange={(e) => handleParamChange(param.name, { ...value, expression: e.target.value })}
                placeholder="输入条件表达式，例如: gameState.score > 100"
                rows={3}
              />
            )}
          </div>
        );
        
      default:
        return (
          <input
            type="text"
            {...commonProps}
          />
        );
    }
  };

  return (
    <div className="command-parameter-editor">
      <div className="editor-backdrop" onClick={onCancel} />
      <div className="editor-modal">
        <div className="editor-header">
          <div className="editor-title">
            <span className="command-icon" style={{ color: template.color }}>
              {template.icon}
            </span>
            <span className="command-name">{template.name}</span>
          </div>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        
        <div className="editor-content">
          <div className="parameters-list">
            {template.parameters.map(param => (
              <div key={param.name} className="parameter-group">
                <label htmlFor={param.name} className="parameter-label">
                  {param.label || param.name}
                  {param.required && <span className="required">*</span>}
                </label>
                
                {renderParameterInput(param)}
                
                {errors[param.name] && (
                  <div className="parameter-error">{errors[param.name]}</div>
                )}
                
                {param.description && (
                  <div className="parameter-description">{param.description}</div>
                )}
              </div>
            ))}
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
