import React, { useMemo, useState, useEffect } from 'react';
import { LevelConfig } from '../types';

interface LevelTabsProps {
  levels: LevelConfig[];
  currentLevelId: string;
  onSelect: (levelId: string) => void;
  onCreate: () => void;
  onCopy: (fromLevelId: string) => void;
  onRename: (levelId: string, newName: string) => void;
  onDelete: (levelId: string) => void;
}

const barStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
  borderBottom: '2px solid #dde7f0', background: '#f3f7fb', color: '#1f2937'
};
const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
  background: active ? '#1f6feb' : '#e5ecf3',
  border: active ? '2px solid #0b4fb3' : '1px solid #c9d6e2',
  color: active ? '#ffffff' : '#1f2937',
  fontWeight: active ? 700 : 500,
  boxShadow: active ? '0 0 0 2px rgba(31,111,235,0.15)' : 'none',
  transition: 'all .12s ease',
  fontSize: 12, lineHeight: '16px', userSelect: 'none'
});

export const LevelTabs: React.FC<LevelTabsProps> = ({ levels, currentLevelId, onSelect, onCreate, onCopy, onRename, onDelete }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const current = useMemo(() => levels.find(l => l.id === currentLevelId), [levels, currentLevelId]);

  return (
    <div style={barStyle}>
      <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto' }}>
        {levels.map(l => (
          <div key={l.id} style={tabStyle(l.id === currentLevelId)}
               onClick={() => onSelect(l.id)}
               onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: l.id }); }}>
            {l.name || l.id}
          </div>
        ))}
        {/* plus tab: create new level */}
        <div title="新建关卡" style={tabStyle(false)} onClick={() => onCreate()}>＋</div>
      </div>
      {menu && (
        <div style={{ position: 'fixed', left: menu.x, top: menu.y, background: '#fff', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 140 }} onClick={(e)=>e.stopPropagation()}>
          <button style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', border:'none', background:'transparent' }} onClick={() => { const l = levels.find(x => x.id === menu.id); if (!l) return; const name = prompt('重命名关卡', l.name || l.id); if (name && name.trim()) onRename(menu.id, name.trim()); setMenu(null); }}>重命名</button>
          <button style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', border:'none', background:'transparent' }} onClick={() => { onCopy(menu.id); setMenu(null); }}>复制</button>
          <button style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', border:'none', background:'transparent', color:'#c00' }} onClick={() => { if (levels.length <= 1) { alert('至少保留一个关卡'); setMenu(null); return; } if (confirm('删除该关卡？')) onDelete(menu.id); setMenu(null); }}>删除</button>
        </div>
      )}
    </div>
  );
};

export default LevelTabs;
