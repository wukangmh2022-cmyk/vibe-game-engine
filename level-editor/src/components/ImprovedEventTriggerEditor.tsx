import React, { useEffect, useState } from 'react';
import './ImprovedEventTriggerEditor.css';

interface ImprovedEventTrigger {
  type: 'auto' | 'custom';
  target?: string; // for custom
  start?: 'immediate'; // for auto
}

interface ImprovedEventTriggerEditorProps {
  trigger: ImprovedEventTrigger;
  variables: Record<string, any>;
  switches: Record<string, boolean>;
  events: Array<{ id: string; name: string }>;
  onSave: (trigger: ImprovedEventTrigger) => void;
  onCancel: () => void;
}

export const ImprovedEventTriggerEditor: React.FC<ImprovedEventTriggerEditorProps> = ({
  trigger,
  variables: _vars,
  switches: _switches,
  events: _events,
  onSave,
  onCancel
}) => {
  const [triggerType, setTriggerType] = useState<ImprovedEventTrigger['type']>((trigger as any)?.type || 'custom');
  const [start, setStart] = useState<'immediate'>((((trigger as any)?.start as any) || 'immediate') as 'immediate');
  const [target, setTarget] = useState<string>((trigger as any)?.target || '');

  useEffect(() => {
    setTriggerType(((trigger as any)?.type as any) || 'custom');
    setStart((((trigger as any)?.start as any) || 'immediate') as 'immediate');
    setTarget((trigger as any)?.target || '');
  }, [trigger]);

  // Auto-sync to parent when fields change; parent弹窗底部“确定”统一提交
  useEffect(() => {
    const out: ImprovedEventTrigger = { type: triggerType } as any;
    if (triggerType === 'auto') out.start = start || 'immediate';
    if (triggerType === 'custom' && target) out.target = target;
    onSave(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerType, start, target]);

  return (
    <div className="improved-event-trigger-editor">
      <h4>编辑触发条件</h4>

      <div className="form-group">
        <label>触发器类型:</label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as any)}
          className="trigger-type-select"
        >
          <option value="custom">🧩 自定义</option>
          <option value="auto">⚡ 自动</option>
        </select>
      </div>

      {triggerType === 'custom' && (
        <div className="form-group">
          <label>事件页被触发的信号ID(target):</label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="请配合“信号发射”指令，这里填入信号的名称"
            className="condition-value-input"
          />
        </div>
      )}

      {triggerType === 'auto' && (
        <div className="form-group">
          <label>开始方式:</label>
          <select
            value={start}
            onChange={(e) => setStart(e.target.value as any)}
            className="condition-type-select"
          >
            <option value="immediate">立即</option>
          </select>
        </div>
      )}

      {/* 底部保存/取消由外层模态框统一处理 */}
    </div>
  );
};
