import React, { useState } from 'react';
import './EventTriggerEditor.css';

interface EventTrigger {
  type: string;
  condition?: {
    type: string;
    expression?: string;
  };
}

interface EventTriggerEditorProps {
  trigger: EventTrigger;
  onSave: (trigger: EventTrigger) => void;
  onCancel: () => void;
}

export const EventTriggerEditor: React.FC<EventTriggerEditorProps> = ({
  trigger,
  onSave,
  onCancel
}) => {
  const [expression, setExpression] = useState<string>(trigger.condition?.expression || '');

  const handleSave = () => {
    const updatedTrigger = {
      ...trigger,
      condition: {
        type: 'expression',
        expression
      }
    };
    onSave(updatedTrigger);
  };

  return (
    <div className="event-trigger-editor">
      <h4>编辑触发条件</h4>
      <div className="form-group">
        <label>条件表达式:</label>
        <textarea
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="例如: event.type === 'button:click' && event.action === 'help-deer'"
          rows={3}
        />
        <div className="expression-hint">
          <p>提示: 使用 event.type 和 event.action 来匹配事件</p>
        </div>
      </div>
      <div className="editor-actions">
        <button onClick={handleSave} className="save-btn">保存</button>
        <button onClick={onCancel} className="cancel-btn">取消</button>
      </div>
    </div>
  );
};