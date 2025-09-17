import React, { useState, useEffect } from 'react';
import { GameProject } from '../types';
import './VariableSwitchManager.css';

interface Variable {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object';
}

interface Switch {
  key: string;
  value: boolean;
}

interface VariableSwitchManagerProps {
  project: GameProject | null;
  onVariableChange: (key: string, value: any) => void;
  onSwitchChange: (key: string, value: boolean) => void;
  onVariableAdd: (key: string, value: any) => void;
  onSwitchAdd: (key: string, value: boolean) => void;
  onVariableDelete: (key: string) => void;
  onSwitchDelete: (key: string) => void;
  // 新增：渲染模式，both=显示二级Tab；variables=仅变量；switches=仅开关
  mode?: 'both' | 'variables' | 'switches';
}

export const VariableSwitchManager: React.FC<VariableSwitchManagerProps> = ({
  project,
  onVariableChange,
  onSwitchChange,
  onVariableAdd,
  onSwitchAdd,
  onVariableDelete,
  onSwitchDelete,
  mode = 'both'
}) => {
  const [activeTab, setActiveTab] = useState<'variables' | 'switches'>(mode === 'switches' ? 'switches' : 'variables');
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [editingSwitch, setEditingSwitch] = useState<Switch | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [formData, setFormData] = useState<any>({});

  // 从项目中提取变量和开关
  const variables: Variable[] = project?.globalVariables 
    ? Object.entries(project.globalVariables).map(([key, value]) => ({
        key,
        value,
        type: typeof value as any
      }))
    : [];

  const switches: Switch[] = project?.globalSwitches
    ? Object.entries(project.globalSwitches).map(([key, value]) => ({
        key,
        value
      }))
    : [];

  // 变量操作函数
  const handleAddVariable = () => {
    setEditingVariable({ key: '', value: '', type: 'string' });
    setEditingIndex(-1);
    setFormData({ key: '', value: '', type: 'string' });
  };

  const handleEditVariable = (variable: Variable, index: number) => {
    setEditingVariable(variable);
    setEditingIndex(index);
    setFormData({ ...variable });
  };

  const handleDeleteVariable = (key: string) => {
    onVariableDelete(key);
  };

  const handleSaveVariable = () => {
    if (!formData.key.trim()) return;
    
    // 处理值的类型转换
    let processedValue = formData.value;
    if (formData.type === 'number') {
      processedValue = Number(formData.value) || 0;
    } else if (formData.type === 'boolean') {
      processedValue = formData.value === 'true' || formData.value === true;
    }
    
    if (editingIndex >= 0) {
      // 编辑现有变量
      onVariableChange(formData.key.trim(), processedValue);
    } else {
      // 添加新变量
      onVariableAdd(formData.key.trim(), processedValue);
    }
    
    setEditingVariable(null);
    setEditingIndex(-1);
    setFormData({});
  };

  const handleCancelVariableEdit = () => {
    setEditingVariable(null);
    setEditingIndex(-1);
    setFormData({});
  };

  // 开关操作函数
  const handleAddSwitch = () => {
    setEditingSwitch({ key: '', value: false });
    setEditingIndex(-1);
    setFormData({ key: '', value: false });
  };

  const handleEditSwitch = (switchItem: Switch, index: number) => {
    setEditingSwitch(switchItem);
    setEditingIndex(index);
    setFormData({ ...switchItem });
  };

  const handleDeleteSwitch = (key: string) => {
    onSwitchDelete(key);
  };

  const handleToggleSwitch = (key: string, currentValue: boolean) => {
    onSwitchChange(key, !currentValue);
  };

  const handleSaveSwitch = () => {
    if (!formData.key.trim()) return;
    
    if (editingIndex >= 0) {
      // 编辑现有开关
      onSwitchChange(formData.key.trim(), formData.value);
    } else {
      // 添加新开关
      onSwitchAdd(formData.key.trim(), formData.value);
    }
    
    setEditingSwitch(null);
    setEditingIndex(-1);
    setFormData({});
  };

  const handleCancelSwitchEdit = () => {
    setEditingSwitch(null);
    setEditingIndex(-1);
    setFormData({});
  };

  // 变量数学运算
  const handleVariableOperation = (key: string, currentValue: any, operation: 'add' | 'sub' | 'mul' | 'div') => {
    if (typeof currentValue !== 'number') return;
    
    const amount = prompt(`请输入${operation === 'add' ? '加' : operation === 'sub' ? '减' : operation === 'mul' ? '乘' : '除以'}的值:`);
    if (amount === null) return;
    
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return;
    
    let newValue = Number(currentValue) || 0;
    switch (operation) {
      case 'add':
        newValue += numAmount;
        break;
      case 'sub':
        newValue -= numAmount;
        break;
      case 'mul':
        newValue *= numAmount;
        break;
      case 'div':
        if (numAmount !== 0) newValue /= numAmount;
        break;
    }
    
    onVariableChange(key, newValue);
  };

  const formatValue = (value: any, type: string): string => {
    if (type === 'boolean') {
      return value ? '真' : '假';
    }
    return String(value);
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'string': return '#17a2b8';
      case 'number': return '#28a745';
      case 'boolean': return '#ffc107';
      default: return '#6c757d';
    }
  };
  
  const showTabs = mode === 'both';

  return (
    <div className="variable-switch-manager">
      <div className="panel-header">
        <h3>变量和开关管理</h3>
      </div>
      {showTabs && (
        <div className="tabs-container">
          <button 
            className={`tab-button ${activeTab === 'variables' ? 'active' : ''}`}
            onClick={() => setActiveTab('variables')}
          >
            📊 变量 ({variables.length})
          </button>
          <button 
            className={`tab-button ${activeTab === 'switches' ? 'active' : ''}`}
            onClick={() => setActiveTab('switches')}
          >
            🔘 开关 ({switches.length})
          </button>
        </div>
      )}
      
      <div className="tab-content">
        {(mode === 'variables' || (showTabs && activeTab === 'variables')) ? (
          <div className="variables-tab">
            <div className="content-header">
              <h4>游戏变量</h4>
              <button className="add-button" onClick={handleAddVariable}>
                ➕ 添加变量
              </button>
            </div>
            
            <div className="items-list">
              {variables.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">📊</div>
                  <div className="message">暂无变量</div>
                  <div className="sub-message">点击上方按钮添加第一个变量</div>
                </div>
              ) : (
                variables.map((variable, index) => (
                  <div key={variable.key} className="item">
                    <div className="item-info">
                      <div className="item-name">{variable.key}</div>
                      <div className="item-value">
                        {formatValue(variable.value, variable.type)}
                      </div>
                    </div>
                    <div 
                      className="item-type" 
                      style={{ backgroundColor: getTypeColor(variable.type) + '20', color: getTypeColor(variable.type) }}
                    >
                      {variable.type}
                    </div>
                    {variable.type === 'number' && (
                      <div className="variable-operations">
                        <button 
                          className="op-button add"
                          onClick={() => handleVariableOperation(variable.key, variable.value, 'add')}
                          title="加法"
                        >
                          +
                        </button>
                        <button 
                          className="op-button sub"
                          onClick={() => handleVariableOperation(variable.key, variable.value, 'sub')}
                          title="减法"
                        >
                          -
                        </button>
                        <button 
                          className="op-button mul"
                          onClick={() => handleVariableOperation(variable.key, variable.value, 'mul')}
                          title="乘法"
                        >
                          ×
                        </button>
                        <button 
                          className="op-button div"
                          onClick={() => handleVariableOperation(variable.key, variable.value, 'div')}
                          title="除法"
                        >
                          ÷
                        </button>
                      </div>
                    )}
                    <div className="item-actions">
                      <button 
                        className="action-button edit"
                        onClick={() => handleEditVariable(variable, index)}
                        title="编辑变量"
                      >
                        ✏️
                      </button>
                      <button 
                        className="action-button delete"
                        onClick={() => handleDeleteVariable(variable.key)}
                        title="删除变量"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
        {(mode === 'switches' || (showTabs && activeTab === 'switches')) ? (
          <div className="switches-tab">
            <div className="content-header">
              <h4>游戏开关</h4>
              <button className="add-button" onClick={handleAddSwitch}>
                ➕ 添加开关
              </button>
            </div>
            
            <div className="items-list">
              {switches.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">🔘</div>
                  <div className="message">暂无开关</div>
                  <div className="sub-message">点击上方按钮添加第一个开关</div>
                </div>
              ) : (
                switches.map((switchItem, index) => (
                  <div key={switchItem.key} className="item">
                    <div 
                      className={`switch-toggle ${switchItem.value ? 'active' : ''}`}
                      onClick={() => handleToggleSwitch(switchItem.key, switchItem.value)}
                    />
                    <div className="item-info">
                      <div className="item-name">{switchItem.key}</div>
                      <div className="item-value">
                        {switchItem.value ? '开启' : '关闭'}
                      </div>
                    </div>
                    <div className="item-actions">
                      <button 
                        className="action-button edit"
                        onClick={() => handleEditSwitch(switchItem, index)}
                        title="编辑开关"
                      >
                        ✏️
                      </button>
                      <button 
                        className="action-button delete"
                        onClick={() => handleDeleteSwitch(switchItem.key)}
                        title="删除开关"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
      
      {/* 变量编辑表单 */}
      {editingVariable && (
        <div className="edit-form">
          <div className="form-content">
            <div className="form-header">
              <h4>{editingIndex >= 0 ? '编辑变量' : '添加变量'}</h4>
              <button className="close-button" onClick={handleCancelVariableEdit}>
                ×
              </button>
            </div>
            
            <div className="form-field">
              <label className="form-label">变量名:</label>
              <input 
                type="text"
                className="form-input"
                value={formData.key || ''}
                onChange={(e) => setFormData({...formData, key: e.target.value})}
                placeholder="请输入变量名"
              />
            </div>
            
            <div className="form-field">
              <label className="form-label">变量类型:</label>
              <select 
                className="form-select"
                value={formData.type || 'string'}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                <option value="string">字符串</option>
                <option value="number">数字</option>
                <option value="boolean">布尔值</option>
              </select>
            </div>
            
            <div className="form-field">
              <label className="form-label">变量值:</label>
              {formData.type === 'boolean' ? (
                <select 
                  className="form-select"
                  value={String(formData.value)}
                  onChange={(e) => setFormData({...formData, value: e.target.value === 'true'})}
                >
                  <option value="false">假 (false)</option>
                  <option value="true">真 (true)</option>
                </select>
              ) : (
                <input 
                  type={formData.type === 'number' ? 'number' : 'text'}
                  className="form-input"
                  value={formData.value || ''}
                  onChange={(e) => setFormData({...formData, value: e.target.value})}
                  placeholder={formData.type === 'number' ? '请输入数字' : '请输入值'}
                />
              )}
            </div>
            
            <div className="form-actions">
              <button className="cancel-button" onClick={handleCancelVariableEdit}>
                取消
              </button>
              <button className="save-button" onClick={handleSaveVariable}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 开关编辑表单 */}
      {editingSwitch && (
        <div className="edit-form">
          <div className="form-content">
            <div className="form-header">
              <h4>{editingIndex >= 0 ? '编辑开关' : '添加开关'}</h4>
              <button className="close-button" onClick={handleCancelSwitchEdit}>
                ×
              </button>
            </div>
            
            <div className="form-field">
              <label className="form-label">开关名:</label>
              <input 
                type="text"
                className="form-input"
                value={formData.key || ''}
                onChange={(e) => setFormData({...formData, key: e.target.value})}
                placeholder="请输入开关名"
              />
            </div>
            
            <div className="form-field">
              <label className="form-label">初始状态:</label>
              <select 
                className="form-select"
                value={String(formData.value)}
                onChange={(e) => setFormData({...formData, value: e.target.value === 'true'})}
              >
                <option value="false">关闭</option>
                <option value="true">开启</option>
              </select>
            </div>
            
            <div className="form-actions">
              <button className="cancel-button" onClick={handleCancelSwitchEdit}>
                取消
              </button>
              <button className="save-button" onClick={handleSaveSwitch}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
