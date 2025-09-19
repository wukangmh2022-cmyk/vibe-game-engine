import React, { useMemo, useState } from 'react';
import { GameCommand, GameProject } from '../types';
import { COMMAND_TEMPLATES } from '../utils/commandTemplates';
import { CommandParameterEditor } from './CommandParameterEditor';
import { CommandLibraryPanel } from './CommandLibraryPanel';
import './CommandListPanel.css';

interface CommandListPanelProps {
  commands: GameCommand[];
  selectedIndex: number;
  project?: GameProject | null;
  onCommandsChange: (commands: GameCommand[]) => void;
  onCommandSelect: (index: number) => void;
}

export const CommandListPanel: React.FC<CommandListPanelProps> = ({
  commands,
  selectedIndex,
  project,
  onCommandsChange,
  onCommandSelect,
}) => {
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const templateMap = useMemo(() => {
    const map = new Map<string, any>();
    COMMAND_TEMPLATES.forEach(t => map.set(String(t.type).toUpperCase(), t));
    return map;
  }, []);

  // 规范化常见同义类型（用于显示/模板匹配），不改变原始数据
  const canonicalType = (raw: any): string => {
    const up = String(raw || '').toUpperCase();
    const alias: Record<string, string> = {
      'CHOICES': 'SHOW_CHOICES',
      'BUTTON': 'SHOW_BUTTON'
    };
    return alias[up] || up;
  };

  const aliasName: Record<string, string> = {
    SHOW_CHOICES: '显示选项', CHOICES: '显示选项',
    SHOW_BUTTON: '显示按钮', BUTTON: '显示按钮',
    SET_CLICKABLE: '设置可点击', SET_SELECTABLE: '设置可选中', CHECK_IN_AREA: '检测区域内',
    ANIMATE_IN: '入场动画', ANIMATE_LOOP: '循环动画', BGM_PLAY: '播放BGM', BGM_STOP: '停止BGM', SE_PLAY: '播放SE',
    FIREWORK_BURST: '烟花特效', IF_CONDITION: '条件分支', EVENT_GROUP: '事件组'
  };

  const getName = (type: any) => {
    const raw = String(type || '');
    const up = canonicalType(raw);
    const tpl = templateMap.get(up);
    return tpl?.name || aliasName[up] || raw || '(未命名指令)';
  };

  const getIcon = (type: any) => {
    const up = String(type || '').toUpperCase();
    const tpl = templateMap.get(up);
    return tpl?.icon || '📝';
  };

  const summary = (cmd: GameCommand) => {
    const p = cmd.parameters || {};
    const pri = p.text || p.elementId || p.resourceId || p.signal || '';
    return typeof pri === 'string' ? pri.slice(0, 60) : JSON.stringify(p).slice(0, 60);
  };

  const add = () => setShowLibrary(true);
  // 计算以 index 开头的“子树”范围（基于 depth 连续项）
  const getSubtreeRange = (index: number): [number, number] => {
    const base = Math.max(0, commands[index]?.depth || 0);
    let end = index + 1;
    while (end < commands.length) {
      const d = Math.max(0, commands[end]?.depth || 0);
      if (d <= base) break;
      end++;
    }
    return [index, end];
  };
  const del = () => {
    if (selectedIndex < 0 || selectedIndex >= commands.length) return;
    const [start, end] = getSubtreeRange(selectedIndex);
    const next = commands.slice();
    next.splice(start, end - start);
    onCommandsChange(next);
    onCommandSelect(Math.max(0, start - 1));
  };
  const dup = () => {
    if (selectedIndex < 0) return;
    const base = commands[selectedIndex];
    const copy = { ...base, id: base.id + '_copy_' + Date.now() };
    const next = commands.slice(); next.splice(selectedIndex + 1, 0, copy); onCommandsChange(next);
  };
  const move = (dir: -1 | 1) => {
    const i = selectedIndex; if (i < 0) return; const j = i + dir; if (j < 0 || j >= commands.length) return;
    const next = commands.slice(); const [m] = next.splice(i, 1); next.splice(j, 0, m); onCommandsChange(next); onCommandSelect(j);
  };

  const onDbl = (i: number) => setEditingIndex(i);
  const tplOf = (cmd: GameCommand) => templateMap.get(canonicalType(cmd.type));

  return (
    <div className="clp" data-testid="command-list-panel">
      <div className="clp-toolbar">
        <button onClick={add}>＋ 添加</button>
        <button onClick={dup} disabled={selectedIndex < 0}>复制</button>
        <button onClick={() => move(-1)} disabled={selectedIndex <= 0}>上移</button>
        <button onClick={() => move(1)} disabled={selectedIndex < 0 || selectedIndex >= commands.length - 1}>下移</button>
        <button onClick={del} disabled={selectedIndex < 0}>删除</button>
        <div className="clp-spacer" />
        <div className="clp-count">共 {commands.length} 条</div>
      </div>
      <div className="clp-list">
        {commands.length === 0 && (
          <div className="clp-empty">暂无指令，点击“添加”创建</div>
        )}
        {commands.map((cmd, i) => (
          <div
            key={cmd.id}
            className={`clp-item ${i === selectedIndex ? 'selected' : ''}`}
            style={{ marginLeft: `${Math.max(0, cmd.depth || 0) * 16}px` }}
            onClick={() => onCommandSelect(i)}
            onDoubleClick={() => onDbl(i)}
          >
            <div className="clp-icon">{getIcon(cmd.type)}</div>
            <div className="clp-main">
              <div className="clp-line" title={String(cmd.type)}>
                {cmd.groupName && <span className="clp-tag">{cmd.groupName}</span>}
                <span className="clp-title">{getName(cmd.type)}</span>
                <span className="clp-sep"> — </span>
                <span className="clp-summary">{summary(cmd)}</span>
              </div>
            </div>
            <div className="clp-index">{i + 1}</div>
          </div>
        ))}
      </div>

      {/* 指令库弹层 */}
      {showLibrary && (
        <div className="clp-modal" onClick={() => setShowLibrary(false)}>
          <div className="clp-dialog" onClick={e => e.stopPropagation()}>
            <div className="clp-dialog-header">
              <div>选择指令类型</div>
              <button onClick={() => setShowLibrary(false)}>×</button>
            </div>
            <div className="clp-dialog-body">
              <CommandLibraryPanel
                project={project}
                onInsert={(c) => {
                  const next = [...commands, c];
                  onCommandsChange(next);
                  setShowLibrary(false);
                  setEditingIndex(next.length - 1);
                  setPendingIndex(next.length - 1);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 参数编辑器（仅当模板存在时） */}
      {editingIndex != null && editingIndex >= 0 && editingIndex < commands.length && tplOf(commands[editingIndex]) && (
        <CommandParameterEditor
          template={tplOf(commands[editingIndex])}
          initialParams={commands[editingIndex].parameters}
          project={project}
          onSave={(p) => { const next = commands.slice(); next[editingIndex] = { ...next[editingIndex], parameters: p }; onCommandsChange(next); setEditingIndex(null); setPendingIndex(null); }}
          onCancel={() => {
            if (pendingIndex != null && pendingIndex === editingIndex) {
              const [start, end] = getSubtreeRange(pendingIndex);
              const next = commands.slice();
              next.splice(start, end - start);
              onCommandsChange(next);
              onCommandSelect(Math.max(0, start - 1));
            }
            setEditingIndex(null);
            setPendingIndex(null);
          }}
        />
      )}
    </div>
  );
};

export default CommandListPanel;
