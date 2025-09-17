import React, { useMemo } from 'react';
import { GameCommand, GameProject, CommandType } from '../types';
import { COMMAND_TEMPLATES, createNewCommand } from '../utils/commandTemplates';

interface CommandLibraryPanelProps {
  project?: GameProject | null;
  onInsert?: (cmd: GameCommand) => void;
}

const EXTRA_ALIASES: Array<{ type: any; name: string; category: string; icon: string; color: string; desc: string }> = [
  { type: 'SHOW_CHOICES', name: '显示选项', category: 'interaction', icon: '📋', color: '#3F51B5', desc: '显示多个可选项并等待用户选择' },
  { type: 'SET_CLICKABLE', name: '设置可点击', category: 'interaction', icon: '🖱️', color: '#3F51B5', desc: '设置元素的点击行为（翻牌/执行命令等）' },
  { type: 'SET_SELECTED', name: '设置选中', category: 'interaction', icon: '✅', color: '#3F51B5', desc: '设置元素的选中状态（含特效）' },
  { type: 'CHECK_IN_AREA', name: '检测区域内', category: 'interaction', icon: '📐', color: '#3F51B5', desc: '检测元素是否进入指定区域' },
  { type: 'ANIMATE_IN', name: '入场动画', category: 'animation', icon: '✨', color: '#FF9800', desc: '常见入场动画（淡入/弹跳/位移）' },
  { type: 'ANIMATE_LOOP', name: '循环动画', category: 'animation', icon: '🔁', color: '#FF9800', desc: '循环动画（悬浮/呼吸等）' },
  { type: 'PLAY_SOUND', name: '播放音效', category: 'audio', icon: '🔊', color: '#9C27B0', desc: '播放一次性音效' },
  { type: 'BGM_PLAY', name: '播放BGM', category: 'audio', icon: '🎵', color: '#9C27B0', desc: '播放背景音乐' },
  { type: 'BGM_PAUSE', name: '暂停BGM', category: 'audio', icon: '⏸️', color: '#9C27B0', desc: '暂停背景音乐' },
  { type: 'BGM_STOP', name: '停止BGM', category: 'audio', icon: '⏹️', color: '#9C27B0', desc: '停止背景音乐' },
  { type: 'SE_PLAY', name: '播放SE', category: 'audio', icon: '🔈', color: '#9C27B0', desc: '播放系统音效' },
  { type: 'SET_VOLUME', name: '设置音量', category: 'audio', icon: '🔉', color: '#9C27B0', desc: '设置全局/分类音量' },
  { type: 'FIREWORK_BURST', name: '烟花特效', category: 'animation', icon: '🧨', color: '#FF9800', desc: '绚丽的烟花粒子效果' },
];

export const CommandLibraryPanel: React.FC<CommandLibraryPanelProps> = ({ project, onInsert }) => {
  const merged = useMemo(() => {
    const base = COMMAND_TEMPLATES.map(t => ({
      type: String(t.type),
      name: t.name,
      description: t.description,
      category: t.category || 'misc',
      icon: (t as any).icon || '⚙️',
      color: (t as any).color || '#607D8B'
    }));
    const extra = EXTRA_ALIASES.filter(e => !base.find(b => b.type.toUpperCase() === String(e.type).toUpperCase()))
      .map(e => ({ type: String(e.type), name: e.name, description: e.desc, category: e.category, icon: e.icon, color: e.color }));
    return [...base, ...extra];
  }, []);
  const cats = useMemo(() => {
    const set = new Set<string>();
    merged.forEach(m => set.add(m.category || 'misc'));
    return Array.from(set);
  }, [merged]);

  const handleInsert = (typeStr: string) => {
    // try to use template first
    const typeAny: any = (CommandType as any)[typeStr] || typeStr as any;
    const found = COMMAND_TEMPLATES.find(t => String(t.type).toUpperCase() === typeStr.toUpperCase());
    let cmd: GameCommand | null = null;
    if (found) {
      cmd = createNewCommand(found.type as any);
    } else {
      cmd = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: (typeStr as any),
        parameters: {},
        enabled: true,
        description: '新指令'
      } as GameCommand;
    }
    if (onInsert && cmd) onInsert(cmd);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', padding: 8 }}>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {cats.map(cat => (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#495057', padding: '2px 4px' }}>{cat}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, overflow: 'auto', maxHeight: '60vh' }}>
              {merged.filter(m => m.category === cat).map(m => (
                <button
                  key={m.type}
                  onClick={() => handleInsert(m.type)}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    border: '1px solid #e9ecef',
                    borderRadius: 6,
                    background: '#fff',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    fontSize: 12
                  }}
                  title={m.description || m.type}
                >
                  <span style={{ width: 16, textAlign: 'center' }}>{m.icon || '⚙️'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommandLibraryPanel;
