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
  const [showRaw, setShowRaw] = useState(false);

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
        const opToken = p.op || (p.expression ? 'set' : 'set');
        const opLabel = (() => {
          switch (opToken) {
            case 'set': return '设为';
            case 'add': return '加';
            case 'sub': return '减';
            case 'mul': return '乘';
            case 'div': return '除以';
            default: return String(opToken || '设为');
          }
        })();
        const val = (() => {
          if (p && typeof p.value === 'object' && p.value) {
            if ((p.value as any).type === 'expression' && (p.value as any).expression) {
              return String((p.value as any).expression);
            }
            try { return JSON.stringify(p.value); } catch { return String(p.value); }
          }
          if (p && p.expression) return String(p.value || '');
          return String(p.value ?? '');
        })();
        return key ? `${key} ${opLabel} ${val}` : '';
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
        if (c.type === 'variable') {
          const op = String(c.operator || 'eq');
          const label = ({ eq: '等于', ne: '不等于', gt: '大于', lt: '小于', gte: '大于等于', lte: '小于等于' } as any)[op] || op;
          return `${c.key || ''} ${label} ${String(c.value ?? '')}`;
        }
        if (c.type === 'switch') return `${c.key || ''} 等于 ${c.value === true ? '开' : '关'}`;
        return '';
      }
      case 'WAIT': {
        return p.duration ? `${p.duration}ms` : '';
      }
      case 'UPDATE_TEXT': {
        const eid = p.elementId || p.id || '';
        let preview = '';
        if (typeof p.text === 'string') preview = p.text;
        else if (p.text && typeof p.text === 'object') {
          if (p.text.type === 'expression' && p.text.expression) preview = String(p.text.expression);
          else try { preview = JSON.stringify(p.text); } catch { preview = '[object]'; }
        }
        return eid ? `${eid}${preview ? ` ← ${preview}` : ''}` : preview;
      }
      case 'SET_ELEMENT_STYLE': {
        const eid = p.elementId || '';
        const disp = p?.style?.display;
        return eid ? `${eid}${disp ? ` 显示状态设为${disp}` : ''}` : '';
      }
      case 'SET_DRAGGABLE': {
        const eid = p.elementId || '';
        const on = p.draggable !== false;
        return eid ? `${eid} ${on ? '拖拽:开' : '拖拽:关'}` : '';
      }
      case 'SET_CLICKABLE': {
        const eid = p.elementId || '';
        const on = p.clickable !== false;
        const act = p.onClick || 'commands';
        return eid ? `${eid} ${on ? '可点' : '禁用'} → ${act}` : '';
      }
      case 'CHECK_IN_AREA': {
        const eid = p.elementId || '';
        const a = p.area || {};
        const ax = a.x != null ? a.x : '?';
        const ay = a.y != null ? a.y : '?';
        const aw = a.width != null ? a.width : '?';
        const ah = a.height != null ? a.height : '?';
        return eid ? `${eid} ∈ [${ax},${ay},${aw},${ah}]` : `[${ax},${ay},${aw},${ah}]`;
      }
      case 'LOOP': {
        const lt = String(p.loopType || 'for').toLowerCase();
        const opSym = (tok: string) => ({ eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' }[tok] || tok || '==');
        if (lt === 'while') {
          const c = p.condition || {};
          if (c.type === 'expression' && c.expression) return `while ${c.expression}`;
          if (c.type === 'variable') return `while ${c.key || ''} ${opSym(String(c.operator||'eq'))} ${c.value ?? ''}`;
          if (c.type === 'switch') return `while ${c.key || ''} == ${String(c.value ?? true)}`;
          return 'while (…)';
        }
        // for
        if (p.variable && (p.start != null) && (p.end != null)) {
          const step = (p.step != null) ? String(p.step) : '1';
          return `for ${p.variable}=${p.start}..${p.end} step ${step}`;
        }
        if (p.count != null) return `for x ${p.count} times`;
        return 'for (…)';
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
  const rawJson = React.useMemo(() => {
    try { return JSON.stringify(treeToJson(tree), null, 2); } catch { return '[]'; }
  }, [tree]);

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
      if (n.type === 'SHOW_CHOICES') {
        if (!n.children.length) n.children = [
          { id: `${n.id}_opt_1`, type: 'BRANCH', label: '选项1', kind: 'branch', children: [] },
          { id: `${n.id}_opt_2`, type: 'BRANCH', label: '选项2', kind: 'branch', children: [] }
        ];
      }
      if (n.type === 'CHECK_IN_AREA') {
        if (!n.children.length) n.children = [
          { id: `${n.id}_hit`, type: 'BRANCH', label: '命中时', kind: 'branch', children: [] }
        ];
      }
      if (n.type === 'SET_SELECTABLE') {
        if (!n.children.length) n.children = [
          { id: `${n.id}_sel_on`, type: 'BRANCH', label: '选中时', kind: 'branch', children: [] },
          { id: `${n.id}_sel_off`, type: 'BRANCH', label: '取消选中时', kind: 'branch', children: [] }
        ];
      }
      if (n.type === 'SET_CLICKABLE') {
        const onClick = String((n as any).parameters?.onClick || '').toLowerCase();
        if (onClick === 'commands' && !n.children.length) {
          n.children = [ { id: `${n.id}_on_click`, type: 'BRANCH', label: '点击时', kind: 'branch', children: [] } ];
        }
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
        <button onClick={() => setShowRaw(s => !s)} style={{ marginLeft: 8 }}>{showRaw ? '显示树' : '显示源数据'}</button>
      </div>
      <div className="ctp-list">
        {showRaw && (
          <div style={{ padding: 8 }}>
            <pre style={{ background: '#0b1020', color: '#e6edf3', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 400 }}>{rawJson}</pre>
          </div>
        )}
        {!showRaw && lines.length === 0 && <div className="clp-empty">暂无指令，点击“添加命令”</div>}
        {!showRaw && lines.map(li => (
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
              {li.node.kind === 'action' && li.node.type === 'SHOW_CHOICES' && (
                <button onClick={(e) => {
                  e.stopPropagation();
                  withTree(nodes => {
                    const { list, index } = getAtPath(nodes, li.path);
                    const me = list[index];
                    const ch = (me.children || []).slice();
                    const nextIdx = ch.length + 1;
                    ch.push({ id: `${me.id}_opt_${nextIdx}`, type: 'BRANCH', label: `选项${nextIdx}`, kind: 'branch', children: [] });
                    const updated = { ...me, children: ch };
                    const nl = list.slice(); nl[index] = updated; return replaceAt(nodes, li.path.slice(0, -1), nl);
                  });
                }}>添加选项</button>
              )}
              {li.node.kind === 'branch' && (
                <>
                  <button onClick={() => setInsertTarget({ path: li.path, mode: 'child' })}>添加</button>
                  {(() => {
                    try {
                      const parentPath = li.path.slice(0, -1);
                      const { list: plist, index: pidx } = getAtPath(tree as any, parentPath);
                      const parentNode = plist?.[pidx];
                      const isChoiceOpt = parentNode && parentNode.type === 'SHOW_CHOICES';
                      const count = isChoiceOpt ? ((parentNode.children || []).length) : 0;
                      if (!isChoiceOpt || count <= 1) return null; // 仅在>1个选项时允许删除
                      return (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          withTree(nodes => {
                            const childIndex = li.path[li.path.length - 1];
                            const parentPath2 = li.path.slice(0, -1);
                            const { list: parentList2, index: parentIndex2 } = getAtPath(nodes, parentPath2);
                            const parentNode2 = parentList2[parentIndex2];
                            const children2 = (parentNode2.children || []).slice();
                            if (children2.length <= 1) return nodes; // 再保险
                            children2.splice(childIndex, 1);
                            return replaceAt(nodes, parentPath2, children2);
                          });
                        }}>删除选项</button>
                      );
                    } catch { return null; }
                  })()}
                </>
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
                  let node: CommandNode = { id: cmd.id, type: String(cmd.type).toUpperCase(), kind: 'action', parameters: cmd.parameters || {}, children: [] };
                  // materialize default branches for branchable types (including CHECK_IN_AREA)
                  node = withDefaultBranches(node);
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
                  if (updated.type === 'SHOW_CHOICES') {
                    // 仅当参数中提供 options/choices 时，才根据其长度/文本同步分支；否则不改动分支数量
                    const arr = Array.isArray(p?.options) ? p.options : (Array.isArray(p?.choices) ? p.choices : null);
                    if (arr) {
                      const desired = Math.max(0, Number(arr.length));
                      const labels = (idx: number) => (arr[idx]?.text) || (arr[idx]?.label) || `选项${idx+1}`;
                      const ch: CommandNode[] = (updated.children || []).slice();
                      if (ch.length < desired) {
                        for (let i = ch.length; i < desired; i++) {
                          ch.push({ id: `${updated.id}_opt_${i+1}`, type: 'BRANCH', label: labels(i), kind: 'branch', children: [] });
                        }
                      } else if (ch.length > desired) {
                        ch.splice(desired);
                      }
                      for (let i = 0; i < ch.length; i++) {
                        ch[i] = { ...ch[i], label: labels(i) };
                      }
                      updated = { ...updated, children: ch };
                    }
                  }
                  if (updated.type === 'CHECK_IN_AREA') {
                    if (!(updated.children && updated.children.length)) {
                      updated = { ...updated, children: [ { id: `${updated.id}_hit`, type: 'BRANCH', label: '命中时', kind: 'branch', children: [] } ] };
                    }
                  }
                  if (updated.type === 'SET_SELECTABLE') {
                    if (!(updated.children && updated.children.length)) {
                      updated = { ...updated, children: [
                        { id: `${updated.id}_sel_on`, type: 'BRANCH', label: '选中时', kind: 'branch', children: [] },
                        { id: `${updated.id}_sel_off`, type: 'BRANCH', label: '取消选中时', kind: 'branch', children: [] }
                      ] };
                    }
                  }
                  if (updated.type === 'SET_CLICKABLE') {
                    const onClick = String(p?.onClick || '').toLowerCase();
                    if (onClick === 'commands') {
                      if (!updated.children || updated.children.length === 0) {
                        updated = { ...updated, children: [ { id: `${updated.id}_on_click`, type: 'BRANCH', label: '点击时', kind: 'branch', children: [] } ] };
                      }
                    } else {
                      // 非 commands 时去掉子分支，避免混淆
                      if (updated.children && updated.children.length) {
                        updated = { ...updated, children: [] };
                      }
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
