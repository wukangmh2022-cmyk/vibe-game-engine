import React, { useState, useEffect } from 'react';
import { ImprovedEventTriggerEditor } from './ImprovedEventTriggerEditor';
import './TriggerModalEditor.css';

interface TriggerModalEditorProps {
  isOpen: boolean;
  trigger: any;
  variables: Record<string, any>;
  switches: Record<string, boolean>;
  events: Array<{id: string, name: string}>;
  onSave: (trigger: any) => void;
  onCancel: () => void;
}

export const TriggerModalEditor: React.FC<TriggerModalEditorProps> = ({
  isOpen,
  trigger,
  variables,
  switches,
  events,
  onSave,
  onCancel
}) => {
  const [localTrigger, setLocalTrigger] = useState<any>(trigger || {});

  useEffect(() => {
    if (isOpen) {
      setLocalTrigger(trigger || {});
    }
  }, [isOpen, trigger]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    onSave(localTrigger);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="trigger-modal-overlay">
      <div className="trigger-modal">
        <div className="modal-header">
          <h3>编辑触发条件</h3>
          <button className="modal-close-btn" onClick={handleCancel}>×</button>
        </div>
        
        <div className="modal-content">
          <ImprovedEventTriggerEditor
            trigger={localTrigger}
            variables={variables}
            switches={switches}
            events={events}
            onSave={setLocalTrigger}
            onCancel={handleCancel}
          />
          
          {/* 添加说明文本 */}
          <div className="trigger-editor-help">
            <p>💡 提示：什么是事件？就是和主流程一样，拥有一段的独立的逻辑指令。</p>
            <p>💡 事件怎么用？例如一些关卡需要倒计时，就可以运用事件这一机制，与主流程并行地，对变量倒计时处理。</p>
            <p>事件触发器是什么？就是什么情况下事件的命令会执行。例如自动是立刻执行该事件，自定义是必须等待特定信号才会启动该事件。</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="modal-save-btn" onClick={handleSave}>确定</button>
        </div>
      </div>
    </div>
  );
};