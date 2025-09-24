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
            <p>💡 提示：什么是事件？就像你做饭时洗衣机在单独运行——一段能独立干活、不打扰主流程的“小任务”。</p>
            <p>💡 事件怎么用？比如关卡倒计时：主流程跑游戏，事件偷偷计算剩余时间，到0就结束，两边同时进行。</p>
            <p>事件触发器是什么？就是启动事件的“开关”：自动=进入关卡就执行；自定义=等特定信号（比如“捡到道具”）才执行。</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="modal-save-btn" onClick={handleSave}>确定</button>
        </div>
      </div>
    </div>
  );
};