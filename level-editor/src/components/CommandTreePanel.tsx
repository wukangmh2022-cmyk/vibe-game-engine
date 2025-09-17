import React, { useEffect, useMemo, useState } from 'react';
import { GameProject } from '../types';
import { CommandNode, jsonToTree, treeToJson } from '../utils/commandTree';
import { COMMAND_TEMPLATES } from '../utils/commandTemplates';
import { CommandLibraryPanel } from './CommandLibraryPanel';
import { CommandParameterEditor } from './CommandParameterEditor';
import './CommandTreePanel.css';

interface CommandTreePanelProps {
  project?: GameProject | null;
  initialCommandsJson: any[];
  onChange?: (json: any[]) => void;
}

interface LineItem {
  node: CommandNode;
  depth: number;
  path: number[]; // indices from root to node
}

export const CommandTreePanel: React.FC<CommandTreePanelProps> = ({ project, initialCommandsJson, onChange }) => {
  const [tree, setTree] = useState<CommandNode[]>([]);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [insertTarget, setInsertTarget] = useState<{ path: number[]; mode: 'child' | 'sibling' } | null>(null);
  const [selectedPath, setSelectedPath] = useState<number[] | null>(null);
  const [editing, setEditing] = useState<{ path: number[] } | null>(null);

  useEffect(() => {
    try { setTree(jsonToTree(initialCommandsJson || [])); } catch { setTree([]); }
    setFolded(new Set());
    setSelectedPath(null);
  }, [initialCommandsJson]);

  const toggle = (id: string) => {
    setFolded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const tplMap = useMemo(() => {
    const m = new Map<string, any>();
    COMMAND_TEMPLATES.forEach(t => m.set(String(t.type).toUpperCase(), t));
    return m;
  }, []);

  const iconOf = (node: CommandNode) => {
    if (node.kind === 'branch') return '⮑';
    const t = tplMap.get(node.type);
    return t?.icon || '📝';
  };
  const titleOf = (node: CommandNode) => node.kind === 'branch' ? (node.label || '分支') : (tplMap.get(node.type)?.name || node.type);
  const summaryOf = (node: CommandNode) => {
    if (node.kind === 'branch') return '';
    const p = node.parameters || {};
    switch (node.type) {
      case 'SET_VARIABLE': {
        const key = p.key || '';
        const op = p.op || (p.expression ? '=' : 'set');
        const val = p.expression ? String(p.value || '') : String(p.value ?? '');
        return key ? `${key} ${op} ${val}` : '';
      }
      case 'SET_SWITCH': {
        const key = p.key || '';
        const val = p.value === true ? '开' : p.value === false ? '关' : String(p.value ?? '');
        return key ? `${key} = ${val}` : '';
      }
      case 'EMIT_SIGNAL': {
        return p.signal ? String(p.signal) : '';
      }
      case 'IF_CONDITION': {
        const c = p.condition || {};
        if (c.type === 'expression') return c.expression ? String(c.expression) : '';
        if (c.type === 'variable') return `${c.key || ''} ${c.operator || '=='} ${String(c.value ?? '')}`;
        if (c.type === 'switch') return `${c.key || ''} == ${c.value === true ? '开' : '关'}`;
        return '';
      }
      case 'WAIT': {
        return p.duration ? `${p.duration}ms` : '';
      }
      case 'JUMP_TO': {
        return p.target ? String(p.target) : (p.targetIndex != null ? `#${p.targetIndex}` : '');
      }
      default: {
        const s = p.text || p.elementId || p.resourceId || p.signal || '';
        return typeof s === 'string' ? s.slice(0, 60) : '';
      }
    }
  };

  const materialize = (nodes: CommandNode[], depth = 0, path: number[] = []): LineItem[] => {
    const out: LineItem[] = [];
    nodes.forEach((n, idx) => {
      const p = [...path, idx];
      out.push({ node: n, depth, path: p });
      if (n.children && n.children.length && !folded.has(n.id)) {
        out.push(...materialize(n.children, depth + 1, p));
      }
    });
    return out;
  };
  const lines = materialize(tree, 0, []);

  // Debug: 渲染前的最终数据（线性化的行）
  try {
    const debug = typeof window !== 'undefined' && localStorage.getItem('DEBUG_TREE') === '1';
    if (debug) {
      // 避免过多日志，只在关键依赖变化时打印
      // 使用一个 effect + 序列化快照
    }
  } catch {}

  React.useEffect(() => {
    try {
      const debug = typeof window !== 'undefined' && localStorage.getItem('DEBUG_TREE') === '1';
      if (!debug) return;
      const snapshot = lines.map(li => ({
        id: li.node.id,
        type: li.node.type,
        label: li.node.label,
        kind: li.node.kind,
        depth: li.depth,
        childrenCount: (li.node.children || []).length
      }));
      console.info('[CommandTreePanel] render-lines', snapshot);
    } catch {}
  }, [JSON.stringify(lines.map(li => [li.node.id, li.depth]))]);

  const withTree = (updater: (nodes: CommandNode[]) => CommandNode[]) => {
    setTree(prev => {
      const next = updater(prev.map(cloneNode));
      onChange?.(treeToJson(next));
      return next;
    });
  };

  const cloneNode = (n: CommandNode): CommandNode => ({ id: n.id, type: n.type, label: n.label, kind: n.kind, parameters: n.parameters ? { ...n.parameters } : undefined, children: (n.children || []).map(cloneNode) });

  const getAtPath = (nodes: CommandNode[], path: number[]): { parent: CommandNode | null; index: number; list: CommandNode[] } => {
    let list = nodes; let parent: CommandNode | null = null;
    for (let i = 0; i < path.length - 1; i++) { parent = list[path[i]]; list = parent.children; }
    return { parent, index: path[path.length - 1], list };
  };

  const delSubtree = (path: number[]) => withTree(nodes => {
    const { list, index } = getAtPath(nodes, path);
    const nl = list.slice(); nl.splice(index, 1);
    return replaceAt(nodes, path.slice(0, -1), nl);
  });

  const replaceAt = (nodes: CommandNode[], path: number[], newList: CommandNode[]): CommandNode[] => {
    if (path.length === 0) return newList;
    const { list, index } = getAtPath(nodes, path);
    const parent = list[index];
    const updated = { ...parent, children: newList };
    const pl = list.slice(); pl[index] = updated;
    return replaceAt(nodes, path.slice(0, -1), pl);
  };

  const moveSibling = (path: number[], dir: -1 | 1) => withTree(nodes => {
    const parentPath = path.slice(0, -1);
    const { list, index } = getAtPath(nodes, path);
    const nl = list.slice(); const j = index + dir; if (j < 0 || j >= nl.length) return nodes;
    const [it] = nl.splice(index, 1); nl.splice(j, 0, it);
    return replaceAt(nodes, parentPath, nl);
  });

  const insertNode = (path: number[], mode: 'child' | 'sibling', node: CommandNode) => withTree(nodes => {
    if (mode === 'child') {
      const { list, index } = getAtPath(nodes, path);
      const parent = list[index];
      const ch = (parent.children || []).slice(); ch.push(node);
      const updated = { ...parent, children: ch };
      const nl = list.slice(); nl[index] = updated; return replaceAt(nodes, path.slice(0, -1), nl);
    } else {
      if (path.length === 0) {
        const nl = nodes.slice(); nl.push(node); return nl;
      }
      const parentPath = path.slice(0, -1);
      const { list, index } = getAtPath(nodes, path);
      const nl = list.slice(); nl.splice(index + 1, 0, node); return replaceAt(nodes, parentPath, nl);
    }
  });

  const tplForType = (typeUp: string) => COMMAND_TEMPLATES.find(t => String(t.type).toUpperCase() === typeUp);

  const withDefaultBranches = (node: CommandNode): CommandNode => {
    const n = { ...node, children: (node.children || []).slice() };
    if (n.kind === 'action') {
      if (n.type === 'IF_CONDITION') {
        if (!n.children.length) n.children = [
          { id: `${n.id}_b_true`, type: 'BRANCH', label: '条件成立时', kind: 'branch', children: [] },
          { id: `${n.id}_b_false`, type: 'BRANCH', label: '条件不成立时', kind: 'branch', children: [] }
        ];
      }
      if (n.type === 'SHOW_BUTTON' || n.type === 'BUTTON') {
        if (!n.children.length) n.children = [
          { id: `${n.id}_b_yes`, type: 'BRANCH', label: '是', kind: 'branch', children: [] },
          { id: `${n.id}_b_no`, type: 'BRANCH', label: '否', kind: 'branch', children: [] }
        ];
      }
      if (n.type === 'SHOW_CHOICES' || n.type === 'CHOICES') {
        if (!n.children.length) n.children = [
          { id: `${n.id}_opt_1`, type: 'BRANCH', label: '选项1', kind: 'branch', children: [] },
          { id: `${n.id}_opt_2`, type: 'BRANCH', label: '选项2', kind: 'branch', children: [] }
        ];
      }
    }
    return n;
  };

  return (
    <div className="ctp">
      <div className="ctp-toolbar">
        <button onClick={() => setInsertTarget({ path: selectedPath || [], mode: 'sibling' })}>＋ 添加指令</button>
        <button onClick={() => { if (selectedPath) moveSibling(selectedPath, -1); }} disabled={!selectedPath}>↑ 上移</button>
        <button onClick={() => { if (selectedPath) moveSibling(selectedPath, 1); }} disabled={!selectedPath}>↓ 下移</button>
        <button onClick={() => { if (selectedPath) { delSubtree(selectedPath); setSelectedPath(null); } }} disabled={!selectedPath}>删除</button>
      </div>
      <div className="ctp-list">
        {lines.length === 0 && <div className="clp-empty">暂无指令，点击“添加命令”</div>}
        {lines.map(li => (
          <div key={li.node.id + '|' + li.path.join('-')} className={`ctp-row ${li.node.kind === 'branch' ? 'branch' : ''} ${selectedPath && JSON.stringify(selectedPath)===JSON.stringify(li.path) ? 'selected' : ''}`} style={{ marginLeft: li.depth * 16 }} onClick={() => setSelectedPath(li.path)}>
            <div className="ctp-toggle" onClick={(e) => { e.stopPropagation(); toggle(li.node.id); }}>{li.node.children?.length ? (folded.has(li.node.id) ? '▶' : '▼') : ''}</div>
            <div className="ctp-icon">{iconOf(li.node)}</div>
            <div className="ctp-main">
              {li.node.kind === 'branch' && <span className="ctp-badge">{li.node.label || '分支'}</span>}
              <span className="ctp-title">{titleOf(li.node)}</span>
              <span className="ctp-summary">{summaryOf(li.node)}</span>
            </div>
            <div className="ctp-actions">
              {li.node.kind === 'action' && tplForType(li.node.type) && (
                <button onClick={() => setEditing({ path: li.path })}>参数</button>
              )}
              {li.node.kind === 'branch' && (
                <button onClick={() => setInsertTarget({ path: li.path, mode: 'child' })}>添加</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {insertTarget && (
        <div className="ctp-modal" onClick={() => setInsertTarget(null)}>
          <div className="ctp-dialog" onClick={e => e.stopPropagation()}>
            <div className="ctp-dialog-header"><div>选择指令类型</div><button onClick={() => setInsertTarget(null)}>×</button></div>
            <div className="ctp-dialog-body">
              <CommandLibraryPanel
                project={project}
                onInsert={(cmd) => {
                  const node: CommandNode = { id: cmd.id, type: String(cmd.type).toUpperCase(), kind: 'action', parameters: cmd.parameters || {}, children: [] };
                  // compute new path after insert
                  const targetPath = insertTarget.path.slice();
                  let newPath: number[] = [];
                  setTree(prev => {
                    // simulate insertion to determine path
                    const sim = prev.map(cloneNode);
                    const applySim = (nodes: CommandNode[]): CommandNode[] => {
                      if (insertTarget.mode === 'child') {
                        const { list, index } = getAtPath(nodes, targetPath);
                        const parent = list[index]; const ch = (parent.children || []).slice(); ch.push(node);
                        newPath = [...targetPath, ch.length - 1];
                        const updated = { ...parent, children: ch }; const nl = list.slice(); nl[index] = updated; return replaceAt(nodes, targetPath.slice(0, -1), nl);
                      } else {
                        if (targetPath.length === 0) { newPath = [sim.length]; const nl = sim.slice(); nl.push(node); return nl; }
                        const parentPath = targetPath.slice(0, -1);
                        const { list, index } = getAtPath(nodes, targetPath);
                        newPath = [...parentPath, index + 1]; const nl = list.slice(); nl.splice(index + 1, 0, node); return replaceAt(nodes, parentPath, nl);
                      }
                    };
                    const next = applySim(sim);
                    onChange?.(treeToJson(next));
                    return next;
                  });
                  setInsertTarget(null);
                  // open parameter editor immediately
                  setSelectedPath(newPath);
                  setEditing({ path: newPath });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {editing && (() => {
        // find node
        const findNode = (nodes: CommandNode[], path: number[]): CommandNode => {
          let cur: any = { children: nodes };
          for (const i of path) cur = cur.children[i];
          return cur;
        };
        const n = findNode(tree, editing.path);
        const tpl = tplForType(n.type);
        if (!tpl) return null;
        const onEditor = (
          <CommandParameterEditor
            template={tpl}
            initialParams={n.parameters || {}}
            project={project}
            onSave={(p) => {
              // set params and then add default branches according to params and type
              withTree(nodes => {
                const setNode = (list: CommandNode[], path: number[], updater: (n: CommandNode) => CommandNode): CommandNode[] => {
                  if (path.length === 0) return list;
                  const idx = path[0]; const rest = path.slice(1);
                  const nl = list.slice();
                  if (rest.length === 0) { nl[idx] = updater(nl[idx]); return nl; }
                  nl[idx] = { ...nl[idx], children: setNode(nl[idx].children || [], rest, updater) };
                  return nl;
                };
                return setNode(nodes, editing.path, (nn) => {
                  let updated: CommandNode = { ...nn, parameters: p };
                  // determine default branches only for branchable types
                  if (updated.type === 'IF_CONDITION') {
                    // always ensure two branches
                    updated = withDefaultBranches(updated);
                  }
                  if (updated.type === 'SHOW_BUTTON' || updated.type === 'BUTTON') {
                    // allow custom labels if provided
                    const yesLabel = p.yesLabel || '是';
                    const noLabel = p.noLabel || '否';
                    let base = withDefaultBranches(updated);
                    // only generate defaults if no children yet
                    if (!(base.children && base.children.length)) base = withDefaultBranches(base);
                    const ch = (base.children || []).map(c => {
                      if (c.label === '是') return { ...c, label: yesLabel };
                      if (c.label === '否') return { ...c, label: noLabel };
                      return c;
                    });
                    updated = { ...base, children: ch };
                  }
                  if (updated.type === 'SHOW_CHOICES' || updated.type === 'CHOICES') {
                    const countFromArray = Array.isArray(p?.options) ? p.options.length : Array.isArray(p?.choices) ? p.choices.length : 0;
                    const count = Math.max(0, Number(countFromArray || p.optionsCount || p.count || 2));
                    // only (re)generate if当前没有 children，占位目的；若已有 children 则保留
                    if (!(updated.children && updated.children.length)) {
                      const ch: CommandNode[] = [];
                      for (let i = 0; i < count; i++) {
                        const label = (Array.isArray(p.options) && p.options[i]?.text) || (Array.isArray(p.choices) && p.choices[i]?.text) || `选项${i+1}`;
                        ch.push({ id: `${updated.id}_opt_${i+1}`, type: 'BRANCH', label, kind: 'branch', children: [] });
                      }
                      updated = { ...updated, children: ch };
                    }
                  }
                  return updated;
                });
              });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        );
        return onEditor;
      })()}
    </div>
  );
};

export default CommandTreePanel;
