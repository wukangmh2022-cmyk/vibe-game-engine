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
    // Merge template defaults into initial parameters (dot-path aware),
    // so editor controls always show sensible defaults even for older commands.
    const getByPath = (obj: any, path: string): any => {
      try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch { return undefined; }
    };
    const setByPath = (obj: any, path: string, val: any): any => {
      const segs = path.split('.');
      const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
      let cur: any = root;
      for (let i = 0; i < segs.length - 1; i++) {
        const k = segs[i];
        const next = cur[k];
        cur[k] = (next && typeof next === 'object') ? { ...next } : {};
        cur = cur[k];
      }
      cur[segs[segs.length - 1]] = val;
      return root;
    };
    const fallbackByType = (t: string | undefined) => {
      switch (t) {
        case 'number': return 0;
        case 'boolean': return false;
        default: return '';
      }
    };

    let merged: any = { ...(initialParams || {}) };
    (template.parameters || []).forEach(p => {
      const cur = getByPath(merged, p.name);
      if (cur === undefined) {
        const v = (p as any).defaultValue !== undefined ? (p as any).defaultValue : fallbackByType(p.type);
        merged = setByPath(merged, p.name, v);
      }
    });
    setParams(merged);
  }, [initialParams, template]);

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

  // dot-path utils
  const getByPath = (obj: any, path: string): any => {
    try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch { return undefined; }
  };
  const setByPath = (obj: any, path: string, val: any): any => {
    const segs = path.split('.');
    const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
    let cur: any = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      const next = cur[k];
      cur[k] = (next && typeof next === 'object') ? { ...next } : {};
      cur = cur[k];
    }
    cur[segs[segs.length - 1]] = val;
    return root;
  };

  const handleParamChange = (paramName: string, value: any) => {
    setParams(prev => setByPath(prev, paramName, value));
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
    if (!validateParams()) return;
    // Normalize expression-type parameters to engine schema
    const opTokenMap: Record<string, string> = { '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' };
    const tokenToSymbol: Record<string, string> = { eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' };
    let normalized = { ...params };
    try {
      const coerce = (val: any) => {
        if (typeof val !== 'string') return val;
        const s = val.trim();
        if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
        if (/^null$/i.test(s)) return null;
        if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
        return val;
      };
      (template.parameters || []).forEach(p => {
        if (p.type !== 'expression') return;
        const v = getByPath(normalized, p.name) || {};
        let out: any = {};
        if (v.type === 'variable') {
          const sym = tokenToSymbol[v.operator] ? tokenToSymbol[v.operator] : (v.operator || '==');
          const tok = opTokenMap[sym] || v.operator || 'eq';
          out = { type: 'variable', key: v.variable || v.key, operator: tok, value: coerce(v.value) };
        } else if (v.type === 'switch') {
          // unify to variable type (switches now part of variables)
          const key = v.switch || v.key;
          const state = typeof v.state === 'boolean' ? v.state : String(v.state) === 'true';
          out = { type: 'variable', key, operator: 'eq', value: state };
        } else {
          // script/expression
          out = { type: 'expression', expression: v.expression || '' };
        }
        normalized = setByPath(normalized, p.name, out);
      });
    } catch {}
    // Coerce common value types for certain commands (e.g., SET_VARIABLE.value)
    try {
      const typeUp = String((template as any).type || '').toUpperCase();
      if (typeUp === 'SET_VARIABLE') {
        const raw = (normalized as any).value;
        if (typeof raw === 'string') {
          const s = raw.trim();
          let parsed: any = s;
          if (/^(true|false)$/i.test(s)) parsed = /^true$/i.test(s);
          else if (/^null$/i.test(s)) parsed = null;
          else if (/^-?\d+(?:\.\d+)?$/.test(s)) parsed = Number(s);
          (normalized as any).value = parsed;
        }
      }
    } catch {}
    onSave(normalized);
  };

  // Helpers for expression preview/normalization
  const opTokenMap: Record<string, string> = { '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' };
  const tokenToSymbol: Record<string, string> = { eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=' , lte: '<=' };
  const normalizeExpr = (v: any) => {
    if (!v || typeof v !== 'object') return { type: 'variable', operator: 'eq', value: '' };
    if (v.type === 'variable') {
      const sym = tokenToSymbol[v.operator] ? tokenToSymbol[v.operator] : (v.operator || '==');
      const tok = opTokenMap[sym] || v.operator || 'eq';
      return { type: 'variable', key: v.variable || v.key || '', operator: tok, value: v.value };
    }
    if (v.type === 'switch') {
      const key = v.switch || v.key || '';
      const state = typeof v.state === 'boolean' ? v.state : String(v.state ?? v.value ?? 'true') === 'true';
      return { type: 'switch', key, operator: 'eq', value: state };
    }
    return { type: 'expression', expression: v.expression || '' };
  };

  const renderParameterInput = (param: CommandParameterDef) => {
    const rawVal = getByPath(params, param.name);
    const value = rawVal === undefined
      ? ((param as any).defaultValue !== undefined ? (param as any).defaultValue : (
          param.type === 'number' ? '' : // keep number blank to avoid NaN in input until focus
          param.type === 'boolean' ? false : ''
        ))
      : rawVal;
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
            onChange={(e) => handleParamChange(param.name, e.target.value === '' ? '' : Number(e.target.value))}
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
        const selected = (project?.resources || []).find(r => r.id === value);
        return (
          <div className="resource-selector" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            <button
              type="button"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={() => {
                const res = (project?.resources || []).find(r => r.id === (getByPath(params, param.name) ?? ''));
                if (res?.src) {
                  try { window.open(res.src, '_blank'); } catch { alert('无法预览资源'); }
                } else {
                  alert('未选择或无法预览该资源');
                }
              }}
            >
              预览
            </button>
            {resourceOptions.length === 0 && (
              <div className="no-options-hint">暂无可用资源，请先添加资源文件</div>
            )}
          </div>
        );
        
      case 'expression':
        // normalize value to object with sane defaults
        const v: any = (value && typeof value === 'object') ? value : { type: 'variable', operator: 'eq', value: '' };
        const normalizedPreview = normalizeExpr(v);
        const humanReadable = (() => {
          if (v.type === 'variable') {
            const sym = tokenToSymbol[v.operator] || v.operator || '==';
            return `${v.variable || v.key || '(变量)'} ${sym} ${v.value ?? ''}`;
          }
          if (v.type === 'switch') {
            return `${v.switch || v.key || '(开关)'} == ${String(v.state ?? v.value ?? 'true')}`;
          }
          return v.expression || '';
        })();
        return (
          <div className="condition-input">
            <select
              className="condition-type"
              value={(v.type === 'expression') ? 'script' : (v.type || 'variable')}
              onChange={(e) => {
                const t = e.target.value;
                if (t === 'variable') handleParamChange(param.name, { type: 'variable', variable: v.variable || '', operator: v.operator || 'eq', value: v.value ?? '' });
                else if (t === 'switch') handleParamChange(param.name, { type: 'switch', switch: v.switch || v.key || '', state: String(v.state ?? v.value ?? 'true') });
                else handleParamChange(param.name, { type: 'script', expression: v.expression || '' });
              }}
            >
              <option value="variable">变量条件</option>
              <option value="switch">开关条件</option>
              <option value="script">脚本表达式</option>
            </select>
            
            {v.type === 'variable' && (
              <div className="variable-condition">
                <select
                  className="variable-name"
                  value={v.variable || ''}
                  onChange={(e) => handleParamChange(param.name, { ...v, variable: e.target.value })}
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
                  value={((): string => {
                    const token = String(v.operator || 'eq');
                    const map: Record<string, string> = { eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' };
                    return map[token] || token || '==';
                  })()}
                  onChange={(e) => {
                    const sym = e.target.value;
                    const map: Record<string, string> = { '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' };
                    handleParamChange(param.name, { ...v, operator: map[sym] || sym });
                  }}
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
                  value={v.value || ''}
                  onChange={(e) => handleParamChange(param.name, { ...v, value: e.target.value })}
                  placeholder="比较值"
                />
              </div>
            )}
            
            {v.type === 'switch' && (
              <div className="switch-condition">
                <select
                  className="switch-name"
                  value={v.switch || v.key || ''}
                  onChange={(e) => handleParamChange(param.name, { ...v, switch: e.target.value, key: e.target.value })}
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
                  value={String(v.state ?? v.value ?? 'true')}
                  onChange={(e) => handleParamChange(param.name, { ...v, state: e.target.value })}
                >
                  <option value="true">开启时</option>
                  <option value="false">关闭时</option>
                </select>
              </div>
            )}
            
            {(v.type === 'script' || v.type === 'expression') && (
              <textarea
                className="script-expression"
                value={v.expression || ''}
                onChange={(e) => handleParamChange(param.name, { ...v, expression: e.target.value, type: 'script' })}
                placeholder="输入条件表达式，例如: gameState.score > 100"
                rows={3}
              />
            )}
            <div style={{ marginTop: 6, fontSize: 12, color: '#6c757d' }}>
              <div>预览(表达式): <code>{humanReadable}</code></div>
            </div>
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
        
        <div className="cmd-editor-content">
          <div className="parameters-list">
            {(() => {
              const consumed = new Set<string>();
              const rows: any[] = [];
              const hasParam = (n: string) => !!template.parameters.find(p => p.name === n);
              const getParam = (n: string) => template.parameters.find(p => p.name === n)!;
              for (const param of template.parameters) {
                if (consumed.has(param.name)) continue;
                // position group
                if (param.name === 'position.x' && hasParam('position.y')) {
                  consumed.add('position.x'); consumed.add('position.y');
                  rows.push(
                    <div key="position.xy" className="parameter-group">
                      <label className="parameter-label">位置 (X/Y)</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {renderParameterInput(getParam('position.x'))}
                        {renderParameterInput(getParam('position.y'))}
                      </div>
                    </div>
                  );
                  continue;
                }
                // size group
                if (param.name === 'size.width' && hasParam('size.height')) {
                  consumed.add('size.width'); consumed.add('size.height');
                  rows.push(
                    <div key="size.wh" className="parameter-group">
                      <label className="parameter-label">尺寸 (W/H)</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {renderParameterInput(getParam('size.width'))}
                        {renderParameterInput(getParam('size.height'))}
                      </div>
                    </div>
                  );
                  continue;
                }
                // default single field
                consumed.add(param.name);
                rows.push(
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
                );
              }
              return rows;
            })()}
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
