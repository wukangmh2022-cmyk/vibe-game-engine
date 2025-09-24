import React, { useState, useEffect } from 'react';
import { CommandTemplate, CommandParameterDef, GameProject } from '../types';
import './CommandParameterEditor.css';

interface CommandParameterEditorProps {
  template: CommandTemplate;
  initialParams: Record<string, any>;
  project?: GameProject | null;
  onSave: (params: Record<string, any>) => void;
  onCancel: () => void;
  commandId?: string;
}

export const CommandParameterEditor: React.FC<CommandParameterEditorProps> = ({
  template,
  initialParams,
  project,
  onSave,
  onCancel,
  commandId
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
    // Do not auto-fill type-based defaults; only apply explicit defaultValue from template.
    const fallbackByType = (_t: string | undefined) => undefined as any;

    let merged: any = { ...(initialParams || {}) };
    (template.parameters || []).forEach(p => {
      const cur = getByPath(merged, p.name);
      if (cur === undefined) {
        if ((p as any).defaultValue !== undefined) {
          merged = setByPath(merged, p.name, (p as any).defaultValue);
        }
      }
    });
    // 动态默认：仅对会生成元素的指令(spawnsElement)默认 elementId=commandId
    try {
      if ((template as any).spawnsElement) {
        const curEid = getByPath(merged, 'elementId');
        if ((!curEid || String(curEid).trim() === '') && commandId) {
          merged = setByPath(merged, 'elementId', commandId);
        }
      }
    } catch {}
    // CHECK_IN_AREA 现已改为使用 (x1,y1,x2,y2) 直接保存；无需转换
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

  // Merge global + inferred variables, with type labels
  const getAllVariableOptions = () => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    const push = (k: string, t?: string) => {
      if (!k || seen.has(k)) return; seen.add(k); out.push({ value: k, label: t ? `${k} (${t})` : k });
    };
    // 1) globals
    try {
      const gv = project?.globalVariables as any;
      if (gv) Object.keys(gv).forEach(k => push(k, typeof gv[k]));
    } catch {}
    // 2) infer from commands
    try {
      const levels = (project?.levels || []) as any[];
      const visit = (list: any[]) => {
        for (const node of list || []) {
          const t = String((node?.type || '')).toUpperCase();
          const p = (node?.parameters || {}) as any;
          if (t === 'SET_VARIABLE' && p?.key) push(p.key, typeof p.value === 'number' ? 'number' : typeof p.value === 'boolean' ? 'boolean' : undefined);
          if (t === 'SET_SWITCH' && p?.key) push(p.key, 'boolean');
          const nested: any[][] = [];
          if (Array.isArray(p.commands)) nested.push(p.commands);
          if (Array.isArray(p.trueCommands)) nested.push(p.trueCommands);
          if (Array.isArray(p.falseCommands)) nested.push(p.falseCommands);
          if (Array.isArray(node.children)) nested.push(node.children);
          nested.forEach(visit);
        }
      };
      for (const lv of levels) visit((lv as any).rawCommands || (lv as any).commands || []);
    } catch {}
    return out;
  };

  const getSwitchOptions = () => {
    if (!project?.globalSwitches) return [];
    return Object.keys(project.globalSwitches).map(key => ({
      value: key,
      label: `${key} (${project.globalSwitches![key] ? '开' : '关'})`
    }));
  };

  const getResourceOptions = (kind?: string | string[]) => {
    if (!project?.resources) return [];
    const kinds = Array.isArray(kind) ? kind : kind ? [kind] : null;
    return project.resources
      .filter(resource => !kinds || kinds.includes(resource.type as any))
      .map(resource => ({ value: resource.id, label: `${resource.name || resource.id} (${resource.type})` }));
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

  // Infer variable type from project: prefer globalVariables; fallback to scanning level commands
  const inferVariableType = (key: string): 'number' | 'boolean' | 'string' | undefined => {
    try {
      // 1) Prefer explicit globalVariables typing
      const gv = project?.globalVariables as any;
      if (gv && Object.prototype.hasOwnProperty.call(gv, key)) {
        const t = typeof gv[key];
        if (t === 'number' || t === 'boolean') return t;
        return 'string';
      }
      // 2) Fallback: scan all levels' commands to infer
      const levels = (project?.levels || []) as any[];
      const visitList = (list: any[]): 'number' | 'boolean' | 'string' | undefined => {
        for (const node of list || []) {
          if (!node) continue;
          const t = String((node.type || '')).toUpperCase();
          const p = (node.parameters || {}) as any;
          if (t === 'SET_VARIABLE' && p && p.key === key) {
            if (typeof p.value === 'number') return 'number';
            if (typeof p.value === 'boolean') return 'boolean';
            const op = String(p.op || 'set').toLowerCase();
            if (op === 'add' || op === 'sub' || op === 'mul' || op === 'div') return 'number';
          }
          if (t === 'SET_SWITCH' && p && p.key === key) return 'boolean';
          // Recurse into known nested arrays
          const nestedArrays: any[][] = [];
          if (Array.isArray(p.commands)) nestedArrays.push(p.commands);
          if (Array.isArray(p.trueCommands)) nestedArrays.push(p.trueCommands);
          if (Array.isArray(p.falseCommands)) nestedArrays.push(p.falseCommands);
          if (Array.isArray(node.children)) nestedArrays.push(node.children);
          for (const arr of nestedArrays) {
            const r = visitList(arr);
            if (r) return r;
          }
        }
        return undefined;
      };
      for (const lv of levels) {
        const cmds = (lv as any).rawCommands || (lv as any).commands || [];
        const r = visitList(cmds);
        if (r) return r;
      }
    } catch {}
    return undefined;
  };

  const handleParamChange = (paramName: string, value: any) => {
    setParams(prev => setByPath(prev, paramName, value));
    // Clear error when user starts typing
    if (errors[paramName]) {
      setErrors(prev => ({ ...prev, [paramName]: '' }));
    }
  };

  const valueByPath = (path: string) => getByPath(params, path);
  const shouldShow = (param: CommandParameterDef): boolean => {
    const cond = (param as any).showIf;
    if (!cond) return true;
    const v = valueByPath(cond.path);
    if (cond.equals !== undefined) return v === cond.equals;
    if (cond.notEquals !== undefined) return v !== cond.notEquals;
    if (Array.isArray(cond.in)) return cond.in.includes(v);
    if (cond.truthy) return !!v;
    if (cond.notEmpty) {
      if (v == null) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    }
    return true;
  };

  const validateParams = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    template.parameters.forEach(param => {
      const value = getByPath(params, param.name);
      const visible = shouldShow(param);
      if (!visible) return; // 隐藏字段不参与必填/范围校验
      
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

    // 模版驱动校验：避免在此处添加非模版声明的强制校验，减少意外阻塞保存
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateParams()) return;
    // Normalize expression-type parameters to engine schema
    const opTokenMap: Record<string, string> = { '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte' };
    const tokenToSymbol: Record<string, string> = { eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' };
    let normalized = { ...params };
    // 若 elementId 为空字符串，则删除它，交由运行时走全局多次触发逻辑
    try {
      const typeUp = String((template as any).type || '').toUpperCase();
      if (typeUp === 'CHECK_IN_AREA') {
        const eidRaw = getByPath(normalized, 'elementId');
        const eid = (eidRaw == null ? '' : String(eidRaw)).trim();
        if (!eid) {
          const cloned = { ...(normalized as any) } as any;
          delete cloned.elementId;
          normalized = cloned;
        }
      }
    } catch {}
    try {
      // SCENE_REDIRECT: auto-prefix scene/ for relative paths; allow special token 'this'
      const typeUp = String((template as any).type || '').toUpperCase();
      if (typeUp === 'SCENE_REDIRECT') {
        const raw = (getByPath(normalized, 'url') ?? '').toString().trim();
        if (raw && raw.toLowerCase() !== 'this') {
          // Keep absolute URLs and absolute paths; otherwise ensure it starts with scene/
          const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
          const isAbsolutePath = raw.startsWith('/');
          const hasScenePrefix = raw.startsWith('scene/');
          const val = (isAbsoluteUrl || isAbsolutePath || hasScenePrefix) ? raw : `scene/${raw}`;
          normalized = setByPath(normalized, 'url', val);
        }
      }
    } catch {}
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
    try {
      // 若该指令会创建元素，则将指令ID写入参数 id，供运行时作为元素ID使用
      if ((template as any).spawnsElement && commandId) {
        const curId = getByPath(normalized, 'id');
        if (!curId) normalized = setByPath(normalized, 'id', commandId);
      }
    } catch {}
    // IF_CONDITION 值类型规范化：按变量/开关真实类型落盘（运行时不再做隐式转换）
    try {
      const typeUp = String((template as any).type || '').toUpperCase();
      if (typeUp === 'IF_CONDITION') {
        const ctype = getByPath(normalized, 'condition.type');
        const key = getByPath(normalized, 'condition.key');
        const raw = getByPath(normalized, 'condition.value');
        let out = raw;
        if (ctype === 'switch') {
          const s = String(raw).trim().toLowerCase();
          out = (s === 'true' || s === '1' || s === 'yes' || s === 'on');
        } else if (ctype === 'variable' && key) {
          // Decide target type: prefer globalVariables; else infer from commands
          let targetType: 'number' | 'boolean' | 'string' | undefined;
          if (project?.globalVariables && (key in (project.globalVariables as any))) {
            const sample = (project.globalVariables as any)[key];
            targetType = typeof sample as any;
          } else {
            targetType = inferVariableType(String(key));
          }
          const text = raw == null ? '' : String(raw).trim();
          if (targetType === 'number') {
            out = /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : raw;
          } else if (targetType === 'boolean') {
            out = (text.toLowerCase() === 'true' || text === '1' || text.toLowerCase() === 'yes' || text.toLowerCase() === 'on');
          } else {
            out = text; // 目标类型为字符串
          }
        }
        normalized = setByPath(normalized, 'condition.value', out);
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

    // Dynamic override: skin select for SHOW_CHOICES
    if (param.name.endsWith('buttonSkinId')) {
      const skins = (project?.resources || []).filter((r: any) => (r as any).type === 'skin');
      if (skins.length) {
        return (
          <select {...commonProps as any} value={String(value || '')} onChange={(e)=>handleParamChange(param.name, e.target.value)}>
            <option value="">（不使用皮肤）</option>
            {skins.map((s: any) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </select>
        );
      }
    }
    // Dynamic override: skin select for SHOW_TEXT (skinId or nested .skinId)
    if (param.name === 'skinId' || param.name.endsWith('.skinId')) {
      const skins = (project?.resources || []).filter((r: any) => (r as any).type === 'skin');
      if (skins.length) {
        return (
          <select {...commonProps as any} value={String(value || '')} onChange={(e)=>handleParamChange(param.name, e.target.value)}>
            <option value="">（不使用皮肤）</option>
            {skins.map((s: any) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
          </select>
        );
      }
    }
    const isCheckInArea = String((template as any).type || '').toUpperCase() === 'CHECK_IN_AREA';
    const areaHintNeeded = isCheckInArea && (param.name === 'area.height');
    switch (param.type) {
      case 'text':
        // 在 IF_CONDITION.condition.key 以及 SET_VARIABLE/SET_SWITCH.key 提供变量下拉/自动完成（datalist，不限制新建）
        if (
          param.name === 'condition.key' ||
          (param.name === 'key' && ['SET_VARIABLE','SET_SWITCH'].includes(String((template as any).type || '').toUpperCase()))
        ) {
          const listId = `varlist-${param.name}`;
          const options = getAllVariableOptions();
          return (
            <>
              <input type="text" list={listId} {...commonProps} />
              <datalist id={listId}>
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </datalist>
            </>
          );
        }
        return (<input type="text" {...commonProps} />);
        
      case 'textarea':
        return (
          <textarea
            {...commonProps}
            rows={3}
          />
        );
        
      case 'number':
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:4, width:'100%' }}>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <input
                type="number"
                {...commonProps}
                min={param.min}
                max={param.max}
                step={1}
                onChange={(e) => handleParamChange(param.name, e.target.value === '' ? '' : Number(e.target.value))}
                style={{ flex:1 }}
              />
              <button type="button" onClick={() => handleParamChange(param.name, Number(value||0) - 1)} style={{ padding:'2px 6px' }}>-</button>
              <button type="button" onClick={() => handleParamChange(param.name, Number(value||0) + 1)} style={{ padding:'2px 6px' }}>+</button>
            </div>
            {areaHintNeeded && (
              <div className="parameter-description" style={{ color:'#888' }}>
                右下坐标 ≈ ({Number(getByPath(params,'area.x')||0) + Number(getByPath(params,'area.width')||0)}, {Number(getByPath(params,'area.y')||0) + Number(getByPath(params,'area.height')||0)})
              </div>
            )}
          </div>
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
        const resourceOptions = getResourceOptions((param as any).resourceKind);
        const selected = (project?.resources || []).find(r => r.id === value);
        return (
          <div
            className="resource-selector"
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            onDragOver={(e) => { try { if (e.dataTransfer?.types?.includes('text/resource-id') || e.dataTransfer?.types?.includes('text/plain')) { e.preventDefault(); } } catch {} }}
            onDrop={(e) => { try { e.preventDefault(); const rid = e.dataTransfer.getData('text/resource-id') || e.dataTransfer.getData('text/plain'); if (rid) handleParamChange(param.name, rid); } catch {} }}
          >
            <select
              {...commonProps}
              className="resource-dropdown"
              title="可从项目资源面板拖拽资源到此处"
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
              <div className="no-options-hint">暂无可用资源，请先添加资源文件（支持拖拽）</div>
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
              value={(v.type === 'expression' || v.type === 'script') ? 'script' : 'variable'}
              onChange={(e) => {
                const t = e.target.value;
                if (t === 'variable') handleParamChange(param.name, { type: 'variable', variable: v.variable || v.key || '', key: v.variable || v.key || '', operator: v.operator || 'eq', value: v.value ?? '' });
                else handleParamChange(param.name, { type: 'script', expression: v.expression || '' });
              }}
            >
              <option value="variable">变量条件</option>
              <option value="script">脚本表达式</option>
            </select>
            
            {v.type === 'variable' && (
              <div className="variable-condition">
                {/* 改为带提示的输入框（datalist），既可下拉选择也可手输新变量名 */}
                {(() => {
                  const listId = `varlist-${param.name}`;
                  const opts = getVariableOptions();
                  return (
                    <>
                      <input
                        type="text"
                        className="variable-name"
                        list={listId}
                        value={v.variable || v.key || ''}
                        onChange={(e) => handleParamChange(param.name, { ...v, variable: e.target.value, key: e.target.value })}
                        placeholder="变量名"
                      />
                      <datalist id={listId}>
                        {opts.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </datalist>
                    </>
                  );
                })()}
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
            
            {/* 移除开关型条件，统一使用变量/脚本 */}
            
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
          {commandId && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0' }}>
              <label style={{ fontSize:12, color:'#6c757d' }}>指令ID</label>
              <input type="text" value={commandId} readOnly disabled style={{ flex:1, opacity:0.7 }} />
            </div>
          )}
          <div className="parameters-list">
            {(() => {
              const consumed = new Set<string>();
              const rows: any[] = [];
              const hasParam = (n: string) => !!template.parameters.find(p => p.name === n);
              const getParam = (n: string) => template.parameters.find(p => p.name === n)!;
              const tUpper = String(template.type).toUpperCase();
              const suppressed = new Set<string>();
              // 若模板明确标记 elementId 为 editorHidden，则隐藏（否则允许编辑 elementId）
              try {
                const eidParam = (template.parameters || []).find(p => p.name === 'elementId') as any;
                if (eidParam && eidParam.editorHidden === true) suppressed.add('elementId');
              } catch {}
              const isSimple = (p: CommandParameterDef) => {
                const n = p.name;
                const type = String(p.type);
                const exclude = new Set([
                  'elementId','text','position.x','position.y','backgroundResourceId','ui.buttonResourceId','skinId'
                ]);
                if (suppressed.has(n)) return false;
                if (exclude.has(n)) return false;
                if (tUpper === 'SHOW_TEXT') {
                  const simpleFields = new Set([
                    'style.fontSize','style.color','style.stroke','style.strokeThickness','style.dropShadow','style.dropShadowColor','style.dropShadowBlur','style.dropShadowAngle','style.dropShadowDistance','style.maxWidth','style.textAlign','padding','backgroundPadding','blocking','dismissOnContinue'
                  ]);
                  if (simpleFields.has(n)) return true;
                  // also treat style.* generically as simple
                  if (n.startsWith('style.')) return true;
                }
                if (tUpper === 'SHOW_CHOICES') {
                  if (n === 'blocking') return true;
                  if (n.startsWith('ui.')) return true;
                }
                return false;
              };
              for (const param of template.parameters) {
                if ((param as any).editorHidden) { consumed.add(param.name); continue; }
                if (suppressed.has(param.name)) { consumed.add(param.name); continue; }
                if (consumed.has(param.name)) continue;
                const visible = shouldShow(param);
                if (!visible) { consumed.add(param.name); continue; }
                // defer simple fields to compact grid
                if (isSimple(param)) {
                  // do not consume now; let compact grid render it after
                  continue;
                }
                // position group
                if (param.name === 'position.x' && hasParam('position.y')) {
                  const vx = shouldShow(getParam('position.x') as any);
                  const vy = shouldShow(getParam('position.y') as any);
                  consumed.add('position.x'); consumed.add('position.y');
                  if (vx && vy) {
                    rows.push(
                      <div key="position.xy" className="parameter-group">
                        <label className="parameter-label">位置 (X/Y)</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {renderParameterInput(getParam('position.x'))}
                          {renderParameterInput(getParam('position.y'))}
                        </div>
                      </div>
                    );
                  } else if (vx) {
                    rows.push(
                      <div key="position.x" className="parameter-group">
                        <label className="parameter-label">X坐标</label>
                        {renderParameterInput(getParam('position.x'))}
                      </div>
                    );
                  } else if (vy) {
                    rows.push(
                      <div key="position.y" className="parameter-group">
                        <label className="parameter-label">Y坐标</label>
                        {renderParameterInput(getParam('position.y'))}
                      </div>
                    );
                  }
                  continue;
                }
                // 角点输入已撤回，继续默认渲染
                // size group
                if (param.name === 'size.width' && hasParam('size.height')) {
                  const vw = shouldShow(getParam('size.width') as any);
                  const vh = shouldShow(getParam('size.height') as any);
                  consumed.add('size.width'); consumed.add('size.height');
                  if (vw && vh) {
                    rows.push(
                      <div key="size.wh" className="parameter-group">
                        <label className="parameter-label">尺寸 (W/H)</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {renderParameterInput(getParam('size.width'))}
                          {renderParameterInput(getParam('size.height'))}
                        </div>
                      </div>
                    );
                  } else if (vw) {
                    rows.push(
                      <div key="size.width" className="parameter-group">
                        <label className="parameter-label">宽度</label>
                        {renderParameterInput(getParam('size.width'))}
                      </div>
                    );
                  } else if (vh) {
                    rows.push(
                      <div key="size.height" className="parameter-group">
                        <label className="parameter-label">高度</label>
                        {renderParameterInput(getParam('size.height'))}
                      </div>
                    );
                  }
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
              // After main fields, render compact simple fields grid (3 per row)
              try {
                const rendered: any[] = [];
                (template.parameters || []).forEach((p) => {
                  if ((p as any).editorHidden) { consumed.add(p.name); return; }
                  if (suppressed.has(p.name)) { consumed.add(p.name); return; }
                  if (!consumed.has(p.name) && shouldShow(p) && isSimple(p)) {
                    consumed.add(p.name);
                    rendered.push(
                      <div key={`compact-${p.name}`} className="parameter-compact-item">
                        <label className="parameter-label">{p.label || p.name}{p.required && <span className="required">*</span>}</label>
                        {renderParameterInput(p)}
                      </div>
                    );
                  }
                });
                if (rendered.length) {
                  rows.push(
                    <div key="__compact__" className="parameter-compact-grid">
                      {rendered}
                    </div>
                  );
                }
              } catch {}
              return rows;
            })()}
          </div>
          {/* 预览已移除：将在独立浮窗中实现单指令预览 */}
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
