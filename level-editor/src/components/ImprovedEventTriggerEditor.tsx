import React, { useState, useEffect } from 'react';
import './ImprovedEventTriggerEditor.css';

interface ImprovedEventTrigger {
  type: 'timer' | 'custom';
  target?: string;
  delay?: number;
  condition?: {
    type: 'expression';
    expression?: string;
  };
  // 添加并联条件支持
  conditions?: Array<{
    type: 'expression';
    expression?: string;
    logic: 'and' | 'or';
  }>;
  // 添加按钮事件关联
  buttonAction?: string;
}

interface GameCommand {
  type: string;
  parameters?: {
    onClick?: string;
    [key: string]: any;
  };
}

interface GameEvent {
  id: string;
  name: string;
  commands?: GameCommand[];
}

interface ImprovedEventTriggerEditorProps {
  trigger: ImprovedEventTrigger;
  variables: Record<string, any>;
  switches: Record<string, boolean>;
  events: GameEvent[];
  onSave: (trigger: ImprovedEventTrigger) => void;
  onCancel: () => void;
}

export const ImprovedEventTriggerEditor: React.FC<ImprovedEventTriggerEditorProps> = ({
  trigger,
  variables,
  switches,
  events,
  onSave,
  onCancel
}) => {
  const [triggerType, setTriggerType] = useState<ImprovedEventTrigger['type']>(trigger.type || 'custom');
  const [delay, setDelay] = useState<number>(trigger.delay || 0);
  
  // 条件类型和值的状态
  const [conditions, setConditions] = useState<Array<{
    id: string;
    type: 'event' | 'variable' | 'switch' | 'timer';
    eventId?: string;
    variableKey?: string;
    variableOperator?: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';
    variableValue?: any;
    switchKey?: string;
    switchValue?: boolean;
    logic: 'and' | 'or';
  }>>([]);

  // 解析按钮事件表达式，支持多种格式
  // 在parseButtonEvents函数中添加日志输出events数组内容
  const parseButtonEvents = (expression: string): string[] => {
      console.log('解析按钮事件表达式:', expression);
      console.log('可用的事件列表:', events);
      
      // 匹配完整的按钮事件表达式: event.type === 'button:click' && event.action === 'xxx'
      const fullButtonPattern = /event\.type\s*===\s*['"]button:click['"]\s*&&\s*event\.action\s*===\s*['"]([^'"]+)['"]\//g;
      // 匹配简化的按钮事件表达式: event.action === 'xxx'
      const simpleButtonPattern = /event\.action\s*===\s*['"]([^'"]+)['"]\//g;
      
      // 修复正则表达式，移除末尾的斜杠
      const fixedFullPattern = /event\.type\s*===\s*['"]button:click['"]\s*&&\s*event\.action\s*===\s*['"]([^'"]+)['"]\//g;
      const fixedSimplePattern = /event\.action\s*===\s*['"]([^'"]+)['"]\//g;
      
      console.log('正则表达式模式:', fixedFullPattern, fixedSimplePattern);
      
      const eventIds = [];
      let match;
      
      // 尝试匹配完整格式
      while ((match = fixedFullPattern.exec(expression)) !== null) {
        console.log('匹配到完整格式按钮事件:', match[1]);
        eventIds.push(match[1]);
      }
      
      // 如果没有找到完整格式，尝试匹配简化格式
      if (eventIds.length === 0) {
        while ((match = fixedSimplePattern.exec(expression)) !== null) {
          console.log('匹配到简化格式按钮事件:', match[1]);
          eventIds.push(match[1]);
        }
      }
      
      // 如果仍然没有匹配到，尝试使用字符串方法
      if (eventIds.length === 0) {
        console.log('使用字符串方法尝试匹配');
        const actionMatch = expression.match(/event\.action\s*===\s*['"]([^'"]+)['"]/);
        if (actionMatch) {
          console.log('使用字符串方法匹配到按钮事件:', actionMatch[1]);
          eventIds.push(actionMatch[1]);
        }
      }
      
      console.log('解析出的按钮事件IDs:', eventIds);
      return eventIds;
    };
    
    // 解析变量条件表达式
    const parseVariableConditions = (expression: string) => {
      console.log('解析变量条件表达式:', expression);
      
      const variablePattern = /context\.stateManager\.getVariable\(['"](.+?)['"]\)\s*([=!<>]+)\s*['"]?(.+?)['"]?(?:\s*&&|\s*\|\||$)/g;
      console.log('变量条件正则表达式:', variablePattern);
      
      const conditions = [];
      let match;
      
      while ((match = variablePattern.exec(expression)) !== null) {
        const variableKey = match[1];
        const operatorSymbol = match[2].trim();
        const variableValue = match[3].trim();
        
        console.log('匹配到变量条件:', { variableKey, operatorSymbol, variableValue });
        
        // 将操作符符号转换为操作符代码
        let variableOperator = 'eq';
        switch (operatorSymbol) {
          case '===': case '==': case '=': variableOperator = 'eq'; break;
          case '!==': case '!=': variableOperator = 'ne'; break;
          case '>': variableOperator = 'gt'; break;
          case '<': variableOperator = 'lt'; break;
          case '>=': variableOperator = 'gte'; break;
          case '<=': variableOperator = 'lte'; break;
        }
        
        conditions.push({ variableKey, variableOperator, variableValue });
      }
      
      // 如果没有匹配到，尝试使用字符串方法
      if (conditions.length === 0) {
        console.log('使用字符串方法尝试匹配变量条件');
        const varMatch = expression.match(/context\.stateManager\.getVariable\(['"](.+?)['"]\)\s*([=!<>]+)\s*['"]?(.+?)['"]?/);
        if (varMatch) {
          const variableKey = varMatch[1];
          const operatorSymbol = varMatch[2].trim();
          const variableValue = varMatch[3].trim();
          
          console.log('使用字符串方法匹配到变量条件:', { variableKey, operatorSymbol, variableValue });
          
          // 将操作符符号转换为操作符代码
          let variableOperator = 'eq';
          switch (operatorSymbol) {
            case '===': case '==': case '=': variableOperator = 'eq'; break;
            case '!==': case '!=': variableOperator = 'ne'; break;
            case '>': variableOperator = 'gt'; break;
            case '<': variableOperator = 'lt'; break;
            case '>=': variableOperator = 'gte'; break;
            case '<=': variableOperator = 'lte'; break;
          }
          
          conditions.push({ variableKey, variableOperator, variableValue });
        }
      }
      
      console.log('解析出的变量条件:', conditions);
      return conditions;
    };
    
    // 解析开关条件表达式
    const parseSwitchConditions = (expression: string) => {
      console.log('解析开关条件表达式:', expression);
      
      const switchPattern = /context\.stateManager\.getSwitch\(['"](.+?)['"]\)\s*===\s*(true|false)/g;
      console.log('开关条件正则表达式:', switchPattern);
      
      const conditions = [];
      let match;
      
      while ((match = switchPattern.exec(expression)) !== null) {
        const switchKey = match[1];
        const switchValue = match[2] === 'true';
        console.log('匹配到开关条件:', { switchKey, switchValue });
        conditions.push({ switchKey, switchValue });
      }
      
      // 如果没有匹配到，尝试使用字符串方法
      if (conditions.length === 0) {
        console.log('使用字符串方法尝试匹配开关条件');
        const switchMatch = expression.match(/context\.stateManager\.getSwitch\(['"](.+?)['"]\)\s*===\s*(true|false)/);
        if (switchMatch) {
          const switchKey = switchMatch[1];
          const switchValue = switchMatch[2] === 'true';
          console.log('使用字符串方法匹配到开关条件:', { switchKey, switchValue });
          conditions.push({ switchKey, switchValue });
        }
      }
      
      console.log('解析出的开关条件:', conditions);
      return conditions;
    };

  // 初始化条件状态
  useEffect(() => {
    // 从现有触发器条件转换为新的条件格式
    const initialConditions: any[] = [];
    
    // 处理主条件
    if (trigger.condition?.expression) {
      const expression = trigger.condition.expression;
      const hasOr = expression.includes(' || ');
      
      // 尝试解析按钮事件
      const eventIds = parseButtonEvents(expression);
      if (eventIds.length > 0) {
        eventIds.forEach((eventId, idx) => {
          initialConditions.push({
            id: `cond_${Date.now()}_${idx}`,
            type: 'event',
            eventId,
            logic: idx > 0 ? (hasOr ? 'or' : 'and') : 'and'
          });
        });
      } else {
        // 尝试解析变量条件
        const variableConditions = parseVariableConditions(expression);
        if (variableConditions.length > 0) {
          variableConditions.forEach((varCond, idx) => {
            initialConditions.push({
              id: `cond_${Date.now()}_${idx}`,
              type: 'variable',
              variableKey: varCond.variableKey,
              variableOperator: varCond.variableOperator,
              variableValue: varCond.variableValue,
              logic: idx > 0 ? (hasOr ? 'or' : 'and') : 'and'
            });
          });
        } else {
          // 尝试解析开关条件
          const switchConditions = parseSwitchConditions(expression);
          if (switchConditions.length > 0) {
            switchConditions.forEach((switchCond, idx) => {
              initialConditions.push({
                id: `cond_${Date.now()}_${idx}`,
                type: 'switch',
                switchKey: switchCond.switchKey,
                switchValue: switchCond.switchValue,
                logic: idx > 0 ? (hasOr ? 'or' : 'and') : 'and'
              });
            });
          } else {
            // 无法解析的表达式，添加默认条件
            initialConditions.push({
              id: `cond_${Date.now()}`,
              type: 'event',
              logic: 'and'
            });
          }
        }
      }
    }
    
    // 处理并联条件
    if (trigger.conditions) {
      trigger.conditions.forEach((cond, index) => {
        if (cond.expression) {
          const eventIds = parseButtonEvents(cond.expression);
          if (eventIds.length > 0) {
            eventIds.forEach(eventId => {
              initialConditions.push({
                id: `cond_${Date.now()}_${index}_${eventId}`,
                type: 'event',
                eventId,
                logic: cond.logic || 'and'
              });
            });
          } else {
            // 尝试解析其他类型的条件
            const variableConditions = parseVariableConditions(cond.expression);
            if (variableConditions.length > 0) {
              variableConditions.forEach((varCond, idx) => {
                initialConditions.push({
                  id: `cond_${Date.now()}_${index}_${idx}`,
                  type: 'variable',
                  variableKey: varCond.variableKey,
                  variableOperator: varCond.variableOperator,
                  variableValue: varCond.variableValue,
                  logic: cond.logic || 'and'
                });
              });
            } else {
              const switchConditions = parseSwitchConditions(cond.expression);
              if (switchConditions.length > 0) {
                switchConditions.forEach((switchCond, idx) => {
                  initialConditions.push({
                    id: `cond_${Date.now()}_${index}_${idx}`,
                    type: 'switch',
                    switchKey: switchCond.switchKey,
                    switchValue: switchCond.switchValue,
                    logic: cond.logic || 'and'
                  });
                });
              }
            }
          }
        }
      });
    }
    
    // 如果没有条件，添加一个默认的事件条件
    if (initialConditions.length === 0) {
      initialConditions.push({
        id: `cond_${Date.now()}`,
        type: 'event',
        logic: 'and'
      });
    }
    
    setConditions(initialConditions);
  }, [trigger]);

  // 获取变量和开关的选项
  const variableOptions = Object.keys(variables).map(key => ({
    value: key,
    label: `${key} (${typeof variables[key]})`
  }));

  const switchOptions = Object.keys(switches).map(key => ({
    value: key,
    label: key
  }));

  // 生成最终的表达式
  const generateExpression = (): string => {
    if (conditions.length === 0) {
      console.log('无条件，返回空表达式');
      return '';
    }
    
    console.log('条件列表:', conditions);
    
    const expressions = conditions.map(cond => {
      switch (cond.type) {
        case 'event':
          if (cond.eventId) {
            return `event.type === 'button:click' && event.action === '${cond.eventId}'`;
          }
          return '';
        case 'variable':
          if (cond.variableKey && cond.variableOperator && cond.variableValue !== undefined) {
            const value = typeof cond.variableValue === 'string' ? `'${cond.variableValue}'` : cond.variableValue;
            const operator = getOperatorSymbol(cond.variableOperator);
            return `context.stateManager.getVariable('${cond.variableKey}') ${operator} ${value}`;
          }
          return '';
        case 'switch':
          if (cond.switchKey !== undefined && cond.switchValue !== undefined) {
            const value = cond.switchValue ? 'true' : 'false';
            return `context.stateManager.getSwitch('${cond.switchKey}') === ${value}`;
          }
          return '';
        case 'timer':
          // Timer类型不生成表达式，它有自己的delay属性
          console.log('Timer类型不生成表达式');
          return '';
        default:
          return '';
      }
    }).filter(expr => expr !== '');
    
    console.log('有效表达式列表:', expressions);
    
    if (expressions.length === 0) {
      console.log('无有效表达式，返回空字符串');
      return '';
    }
    
    const result = expressions.join(' && ');
    console.log('最终生成的表达式:', result);
    return result;
  };
  
  // 获取操作符符号
  const getOperatorSymbol = (op: string): string => {
    switch (op) {
      case 'eq': return '===';
      case 'ne': return '!==';
      case 'gt': return '>';
      case 'lt': return '<';
      case 'gte': return '>=';
      case 'lte': return '<=';
      default: return '===';
    }
  };

  const handleSave = () => {
    // 生成最终的表达式
    const finalExpression = generateExpression();
    
    // 构建触发器对象
    const newTrigger: any = {
      type: triggerType
    };

    // 根据触发器类型添加特定属性
    if (triggerType === 'timer') {
      newTrigger.delay = delay || 0;
    }

    // 对于所有触发器类型，如果生成了表达式，则添加条件
    if (finalExpression) {
      newTrigger.condition = {
        type: 'expression',
        expression: finalExpression
      };
    }

    onSave(newTrigger);
  };

  // 添加新的条件
  const addCondition = () => {
    setConditions(prev => [
      ...prev,
      {
        id: `cond_${Date.now()}`,
        type: 'event',
        logic: 'and'
      }
    ]);
  };

  // 更新条件
  const updateCondition = (id: string, field: string, value: any) => {
    setConditions(prev => {
      return prev.map(cond => {
        if (cond.id === id) {
          return { ...cond, [field]: value };
        }
        return cond;
      });
    });
  };

  // 删除条件
  const removeCondition = (id: string) => {
    setConditions(prev => prev.filter(cond => cond.id !== id));
  };


  // 渲染条件编辑器
  const renderConditionEditor = (condition: any) => {
    switch (condition.type) {
      case 'event':
        console.log('渲染事件条件编辑器，当前eventId:', condition.eventId);
        console.log('可用事件列表:', events);
        return (
          <select
            value={condition.eventId || ''}
            onChange={(e) => updateCondition(condition.id, 'eventId', e.target.value)}
            className="condition-value-select"
          >
            <option value="">选择事件</option>
            {events.map(event => {
              console.log('事件选项:', event.id, event.name);
              return (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              );
            })}
            {/* 添加一个特殊选项用于显示解析出的按钮事件ID */}
            {condition.eventId && !events.some(e => e.id === condition.eventId) && (
              <option key={condition.eventId} value={condition.eventId}>
                {condition.eventId} (按钮事件)
              </option>
            )}
          </select>
        );
      
      case 'variable':
        return (
          <div className="condition-row">
            <select
              value={condition.variableKey || ''}
              onChange={(e) => updateCondition(condition.id, 'variableKey', e.target.value)}
              className="condition-variable-select"
            >
              <option value="">选择变量</option>
              {variableOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            
            <select
              value={condition.variableOperator || 'eq'}
              onChange={(e) => updateCondition(condition.id, 'variableOperator', e.target.value)}
              className="condition-operator-select"
            >
              <option value="eq">等于</option>
              <option value="ne">不等于</option>
              <option value="gt">大于</option>
              <option value="lt">小于</option>
              <option value="gte">大于等于</option>
              <option value="lte">小于等于</option>
            </select>
            
            <input
              type="text"
              value={condition.variableValue !== undefined ? condition.variableValue : ''}
              onChange={(e) => updateCondition(condition.id, 'variableValue', e.target.value)}
              placeholder="输入值"
              className="condition-value-input"
            />
          </div>
        );
      
      case 'switch':
        return (
          <div className="condition-row">
            <select
              value={condition.switchKey || ''}
              onChange={(e) => updateCondition(condition.id, 'switchKey', e.target.value)}
              className="condition-switch-select"
            >
              <option value="">选择开关</option>
              {switchOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            
            <select
              value={condition.switchValue !== undefined ? condition.switchValue.toString() : ''}
              onChange={(e) => updateCondition(condition.id, 'switchValue', e.target.value === 'true')}
              className="condition-switch-value-select"
            >
              <option value="">选择值</option>
              <option value="true">开启</option>
              <option value="false">关闭</option>
            </select>
          </div>
        );
      
      case 'timer':
        return (
          <input
            type="number"
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            placeholder="延迟时间(毫秒)"
            className="condition-timer-input"
            min="0"
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="improved-event-trigger-editor">
      <h4>编辑触发条件</h4>
      
      <div className="form-group">
        <label>触发器类型:</label>
        <select 
          value={triggerType} 
          onChange={(e) => setTriggerType(e.target.value as ImprovedEventTrigger['type'])}
          className="trigger-type-select"
        >
          <option value="custom">🖱️ 条件触发</option>
          <option value="timer">⏱️ 时间触发</option>
        </select>
      </div>

      {/* 条件编辑器 */}
      <div className="conditions-editor">
        <h5>触发条件:</h5>
        {conditions.map((condition, index) => (
          <div key={condition.id} className="condition-item">
            {index > 0 && (
              <select
                value={condition.logic}
                onChange={(e) => updateCondition(condition.id, 'logic', e.target.value)}
                className="condition-logic-select"
              >
                <option value="and">并且</option>
                <option value="or">或者</option>
              </select>
            )}
            
            <select
              value={condition.type}
              onChange={(e) => updateCondition(condition.id, 'type', e.target.value)}
              className="condition-type-select"
            >
              <option value="event">🖱️ 按钮事件</option>
              <option value="variable">📊 变量条件</option>
              <option value="switch">🔛 开关条件</option>
            </select>
            
            <div className="condition-editor">
              {renderConditionEditor(condition)}
            </div>
            
            <button 
              onClick={() => removeCondition(condition.id)}
              className="remove-condition-btn"
              title="删除条件"
            >
              ×
            </button>
          </div>
        ))}
        
        <button onClick={addCondition} className="add-condition-btn">
          + 添加条件
        </button>
      </div>

      {/* 显示当前等效表达式 */}
      <div className="expression-preview">
        <h5>等效表达式 (只读):</h5>
        <div className="expression-preview-content">
          {generateExpression() || '无表达式'}
        </div>
      </div>

      <div className="editor-actions">
        <button onClick={handleSave} className="save-btn">💾 保存</button>
        <button onClick={onCancel} className="cancel-btn">❌ 取消</button>
      </div>
    </div>
  );
};