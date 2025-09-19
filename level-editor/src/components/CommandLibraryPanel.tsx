import React, { useMemo } from 'react';
import { GameCommand, GameProject, CommandType } from '../types';
import { COMMAND_TEMPLATES, createNewCommand } from '../utils/commandTemplates';

interface CommandLibraryPanelProps {
  project?: GameProject | null;
  onInsert?: (cmd: GameCommand) => void;
}

const EXTRA_ALIASES: Array<{ type: any; name: string; category: string; icon: string; color: string; desc: string }> = [

];

export const CommandLibraryPanel: React.FC<CommandLibraryPanelProps> = ({ project, onInsert }) => {
  const usedTypes = useMemo(() => {
    const set = new Set<string>();
    const pushType = (t: any) => { if (t) set.add(String(t).toUpperCase()); };
    const walkList = (arr: any[]) => {
      (arr || []).forEach((cmd) => {
        if (!cmd) return;
        const t = (typeof cmd.type === 'string') ? cmd.type : (cmd.type && String(cmd.type)) || '';
        pushType(t);
        const p = (cmd.parameters || {}) as any;
        // if_condition
        if (Array.isArray(p.trueCommands)) walkList(p.trueCommands);
        if (Array.isArray(p.falseCommands)) walkList(p.falseCommands);
        // loop/clickable body
        if (Array.isArray(p.commands)) walkList(p.commands);
        // choices/options
        const opts = Array.isArray(p.options) ? p.options : (Array.isArray((cmd as any).options) ? (cmd as any).options : []);
        (opts || []).forEach((o: any) => { if (Array.isArray(o?.commands)) walkList(o.commands); });
        // button branches
        const branches = (cmd as any).branches || p.branches;
        if (branches) {
          if (Array.isArray(branches.yes?.commands)) walkList(branches.yes.commands);
          if (Array.isArray(branches.no?.commands)) walkList(branches.no.commands);
        }
      });
    };
    try {
      (project?.levels || []).forEach((lv: any) => {
        if (Array.isArray(lv?.rawCommands)) walkList(lv.rawCommands);
        (lv?.events || []).forEach((ev: any) => { if (Array.isArray(ev?.commands)) walkList(ev.commands); });
      });
    } catch {}
    return set;
  }, [project]);

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
    const all = [...base, ...extra];
    // Hide HIDE_ELEMENTS if not used in project JSON
    return all.filter(item => {
      const up = String(item.type).toUpperCase();
      if (up === 'HIDE_ELEMENTS' && !usedTypes.has('HIDE_ELEMENTS')) return false;
      return true;
    });
  }, [usedTypes]);
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
