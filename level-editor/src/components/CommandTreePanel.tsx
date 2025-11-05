import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  // node line
  node?: CommandNode;
  path?: number[]; // indices from root to node
  // placeholder line (end of a commands container)
  placeholder?: boolean;
  parentPath?: number[]; // path of the parent node (branch) or [] for root
  depth: number;
}

export const CommandTreePanel: React.FC<CommandTreePanelProps> = ({ project, initialCommandsJson, onChange }) => {
  const [tree, setTree] = useState<CommandNode[]>([]);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [insertTarget, setInsertTarget] = useState<{ path: number[]; mode: 'child' | 'sibling' } | null>(null);
  const [selectedPath, setSelectedPath] = useState<number[] | null>(null);
  const [multiSel, setMultiSel] = useState<{ parentPath: number[]; start: number; end: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; mode: 'single' | 'multi' | 'placeholder'; path: number[] } | null>(null);
  const [clipboard, setClipboard] = useState<{ nodes: CommandNode[]; cut?: boolean } | null>(null);
  const [editing, setEditing] = useState<{ path: number[] } | null>(null);
  const [pendingNewPath, setPendingNewPath] = useState<number[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState<null | 'ok' | 'err'>(null);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<number[] | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<{ id?: string; status?: 'start'|'complete'|'error' } | null>(null);
  const idSetRef = React.useRef<Set<string>>(new Set());

  // 监听运行时指令执行事件，用于高亮当前执行节点
  useEffect(() => {
    const onCmd = (e: any) => {
      try {
        const d = (e as CustomEvent).detail || {};
        // Only react if the command ID exists in the currently visible tree
        if (!d.id || !idSetRef.current.has(d.id)) return;
        setRuntimeStatus({ id: d.id, status: d.status });
        // 自动清除完成/错误高亮
        if (d.status === 'complete' || d.status === 'error') {
          setTimeout(() => setRuntimeStatus(s => (s && s.id === d.id ? null : s)), 1200);
        }
      } catch {}
    };
    window.addEventListener('editor:runtime_command', onCmd as any);
    return () => window.removeEventListener('editor:runtime_command', onCmd as any);
  }, []);

  useEffect(() => {
    try { setTree(jsonToTree(initialCommandsJson || [])); } catch { setTree([]); }
    // 不再强制清空选中项，避免删除后丢失“下一个命令”的光标态
    // 若需要后续做健壮校验，可在此检测 selectedPath 是否仍然有效并在无效时回退到同层相邻节点
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
  const stripExt = (s: string) => s.replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, '');
  const fileBaseNameOf = (resId?: string): string => {
    const id = String(resId || '').trim();
    if (!id) return '';
    try {
      const list = (project?.resources || []);
      // 优先显示资源的人类可读 name（去后缀）
      const byId = list.find(r => String(r.id) === id);
      if (byId) {
        if (byId.name) return stripExt(String(byId.name));
        if (byId.src) { const last = String(byId.src).split(/[\\/]/).pop() || String(byId.src); return stripExt(last) || id; }
      }
      // 兼容：以 name 匹配（有些项目把资源ID直接设为文件名）
      const byName = list.find(r => String(r.name) === id);
      if (byName) { return stripExt(String(byName.name || '')) || id; }
      // 兼容：以 src 含有 id 的方式模糊匹配
      const bySrc = list.find(r => String(r.src || '').includes(id));
      if (bySrc) { const last = String(bySrc.src).split(/[\\/]/).pop() || String(bySrc.src); return stripExt(last) || id; }
    } catch {}
    return id;
  };

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
          const v = c.value;
          const valStr = (typeof v === 'string') ? `'${v}'` : String(v ?? '');
          return `${c.key || ''} ${label} ${valStr}`;
        }
        if (c.type === 'switch') return `${c.key || ''} 等于 ${c.value === true ? '开' : '关'}`;
        return '';
      }
      case 'BREAK': {
        const c = p.condition || {};
        if (!c || Object.keys(c).length === 0) return '跳出循环';
        if (c.type === 'expression' && c.expression) return `当 ${c.expression} 时跳出`;
        if (c.type === 'variable') {
          const op = String(c.operator || 'eq');
          const label = ({ eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' } as any)[op] || op;
          const v = c.value;
          const valStr = (typeof v === 'string') ? `'${v}'` : String(v ?? '');
          return `当 ${c.key || ''} ${label} ${valStr} 时跳出`;
        }
        if (c.type === 'switch') return `当 ${c.key || ''} == ${String(c.value === true ? '开' : '关')} 时跳出`;
        return '跳出循环';
      }
      case 'CONTINUE': {
        const c = p.condition || {};
        if (!c || Object.keys(c).length === 0) return '继续下一次迭代';
        if (c.type === 'expression' && c.expression) return `当 ${c.expression} 时继续`;
        if (c.type === 'variable') {
          const op = String(c.operator || 'eq');
          const label = ({ eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' } as any)[op] || op;
          const v = c.value;
          const valStr = (typeof v === 'string') ? `'${v}'` : String(v ?? '');
          return `当 ${c.key || ''} ${label} ${valStr} 时继续`;
        }
        if (c.type === 'switch') return `当 ${c.key || ''} == ${String(c.value === true ? '开' : '关')} 时继续`;
        return '继续下一次迭代';
      }
      case 'WAIT': {
        return p.duration ? `${p.duration}ms` : '';
      }
      case 'BGM_PLAY': {
        const id = p.musicId || p.bgmId || p.id || '';
        const name = fileBaseNameOf(id);
        const vol = (p.volume != null) ? ` · 音量${p.volume}` : '';
        const loop = (p.loop === false) ? ' · 不循环' : (p.loop === true ? ' · 循环' : '');
        return name ? `${name}${vol}${loop}` : '';
      }
      case 'SE_PLAY': {
        const id = p.soundId || p.seId || p.id || '';
        const name = fileBaseNameOf(id);
        const vol = (p.volume != null) ? ` · 音量${p.volume}` : '';
        return name ? `${name}${vol}` : '';
      }
      case 'SCENE_REDIRECT': {
        const url = p.url || p.scene || '';
        const idx = (p.levelIndex != null) ? ` · 关卡#${p.levelIndex}` : '';
        return url ? `${url}${idx}` : '';
      }
      case 'SCRIPT': {
        const code: string = String(p.code || '').trim();
        if (!code) return '脚本';
        const first = code.split(/\n/)[0].trim();
        return first.length > 40 ? first.slice(0, 40) + '…' : first;
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
      case 'SHOW_IMAGE': {
        const eid = p.elementId || p.id || '';
        const rid = p.resourceId || '';
        let name = fileBaseNameOf(rid);
        if (!name && p.src) {
          try { const last = String(p.src).split(/[\\/]/).pop() || String(p.src); name = last.replace(/\.[a-zA-Z0-9]+$/, ''); } catch {}
        }
        if (eid && name) return `${eid} ← ${name}`;
        return name || eid || '';
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
        const outsideMark = p.outside ? '（区域外）' : '';
        const enterMark = (p.requireEnter) ? '（仅进入）' : '';
        return eid ? `${eid} ∈ [${ax},${ay},${aw},${ah}]${outsideMark}${enterMark}` : `[${ax},${ay},${aw},${ah}]${outsideMark}${enterMark}`;
      }
      case 'LOOP': {
        const lt = String(p.loopType || 'for').toLowerCase();
        const opSym = (tok: string) => ({ eq: '==', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=' }[tok] || tok || '==');
        // 无参数的新版循环：直接显示 loop
        if (!p || (Object.keys(p).length === 0)) return 'loop';
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

  // Materialize lines with placeholders for commands containers (root and branch.children)
  const lines: LineItem[] = React.useMemo(() => {
    const out: LineItem[] = [];
    const fold = folded;

    const addCommandsContainer = (cmds: CommandNode[], depth: number, parentPath: number[]) => {
      for (let i = 0; i < cmds.length; i++) {
        const n = cmds[i];
        const p = [...parentPath, i];
        out.push({ node: n, depth, path: p });
        if (!fold.has(n.id) && n.kind === 'action' && (n.children || []).length) {
          addBranches(n.children || [], depth + 1, p);
        }
        if (!fold.has(n.id) && n.kind === 'branch') {
          // nested branch as command (rare) — still render its commands container
          addCommandsContainer(n.children || [], depth + 1, p);
        }
      }
      // single placeholder at the end of this commands container
      out.push({ placeholder: true, parentPath, depth });
    };

    const addBranches = (branches: CommandNode[], depth: number, parentPath: number[]) => {
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        const p = [...parentPath, i];
        out.push({ node: b, depth, path: p });
        if (!fold.has(b.id)) {
          // for each branch, render its commands container (even if empty)
          addCommandsContainer(b.children || [], depth + 1, p);
        }
      }
      // NOTE: do NOT add placeholder for branches list itself
    };

    addCommandsContainer(tree, 0, []);
    return out;
  }, [tree, folded]);
  const rawJson = React.useMemo(() => {
    try { return JSON.stringify(treeToJson(tree), null, 2); } catch { return '[]'; }
  }, [tree]);

  // JSON syntax highlight (no external deps)
  const highlightJson = (json: string): string => {
    if (json == null) return '';
    let s = String(json)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const re = /(\"(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\\"])*\"\s*:)|(\"(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\\"])*\")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;
    s = s.replace(re, (match, key, str, kw, num) => {
      if (key) return `<span class=\"j-key\">${key.slice(0, -1)}</span><span class=\"j-punc\">:</span>`;
      if (str) return `<span class=\"j-str\">${str}</span>`;
      if (kw) return `<span class=\"j-kw\">${kw}</span>`;
      if (num) return `<span class=\"j-num\">${num}</span>`;
      return match;
    });
    return s;
  };

  const highlightedRaw = React.useMemo(() => highlightJson(rawJson), [rawJson]);

  const copyRaw = async () => {
    try {
      const ok = await tryWriteClipboard(rawJson);
      setCopiedRaw(ok ? 'ok' : 'err');
    } catch {
      setCopiedRaw('err');
    }
    setTimeout(() => setCopiedRaw(null), 1600);
  };

  // Build a fast lookup of visible node IDs for runtime event filtering
  React.useEffect(() => {
    try {
      const s = new Set<string>();
      for (const li of lines) {
        if (li.node && li.node.id) s.add(li.node.id);
      }
      idSetRef.current = s;
    } catch { idSetRef.current = new Set(); }
  }, [JSON.stringify(lines.map(li => li.node ? li.node.id : `ph:${(li.parentPath||[]).join('-')}`))]);

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
      const snapshot = lines.map(li => li.node ? ({
        id: li.node.id,
        type: li.node.type,
        label: li.node.label,
        kind: li.node.kind,
        depth: li.depth,
        childrenCount: (li.node.children || []).length
      }) : ({ placeholder: true, parentPath: (li.parentPath || []).join('-'), depth: li.depth }));
      console.info('[CommandTreePanel] render-lines', snapshot);
    } catch {}
  }, [JSON.stringify(lines.map(li => [li.node ? li.node.id : `ph|${(li.parentPath||[]).join('-')}`, li.depth]))]);

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
        const p: any = n.parameters || {};
        let choices: string[] = [];
        if (Array.isArray(p.choices)) choices = p.choices.map((x: any) => String(x));
        else if (typeof p.choices === 'string') choices = String(p.choices).split(',').map(s => s.trim()).filter(Boolean);
        if (!n.children.length) {
          if (choices.length === 0) choices = ['选项1', '选项2'];
          n.children = choices.map((label, i) => ({ id: `${n.id}_opt_${i+1}`, type: 'BRANCH', label, kind: 'branch', children: [] }));
        }
        // 不再把 choices 写回 parameters，仅用于首次生成分支
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

  // ---------- JSON clipboard helpers ----------
  const nodesToJsonText = (nodes: CommandNode[]): string => {
    try { return JSON.stringify(treeToJson(nodes), null, 2); } catch { return '[]'; }
  };
  const jsonTextToNodes = (text: string): CommandNode[] => {
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : (Array.isArray((data||{}).commands) ? (data as any).commands : []);
      return jsonToTree(arr || []);
    } catch { return []; }
  };
  const tryWriteClipboard = async (text: string) => {
    try { await (navigator as any)?.clipboard?.writeText?.(text); return true; } catch { return false; }
  };
  const tryReadClipboard = async (): Promise<string | null> => {
    try { const t = await (navigator as any)?.clipboard?.readText?.(); if (t && t.trim()) return t; } catch {}
    try { const t = prompt('从JSON粘贴（输入JSON数组或包含 commands 的对象）'); return t && t.trim() ? t : null; } catch { return null; }
  };

  // ---------- Selection & clipboard helpers ----------
  const eqArr = (a: number[] | null | undefined, b: number[] | null | undefined) => {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const parentPathOf = (p: number[]) => p.slice(0, -1);
  const indexOf = (p: number[]) => p[p.length - 1];
  const isInMultiRange = (p: number[]) => {
    if (!multiSel) return false;
    const sameParent = eqArr(parentPathOf(p), multiSel.parentPath);
    const idx = indexOf(p);
    return sameParent && idx >= Math.min(multiSel.start, multiSel.end) && idx <= Math.max(multiSel.start, multiSel.end);
  };
  const handleRowClick = (e: React.MouseEvent, p: number[]) => {
    try { e.stopPropagation(); } catch {}
    if (e.shiftKey && selectedPath) {
      const p1 = selectedPath;
      if (eqArr(parentPathOf(p1), parentPathOf(p))) {
        setSelectedPath(p);
        setMultiSel({ parentPath: parentPathOf(p1), start: indexOf(p1), end: indexOf(p) });
        setCtxMenu(null);
        setSelectedPlaceholder(null);
        return;
      }
    }
    setSelectedPath(p);
    setMultiSel(null);
    setCtxMenu(null);
    setSelectedPlaceholder(null);
  };
  const handleContextMenu = (e: React.MouseEvent, p: number[]) => {
    e.preventDefault();
    setSelectedPlaceholder(null);
    const inRange = isInMultiRange(p);
    if (!inRange) {
      setSelectedPath(p);
      setMultiSel(null);
      setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'single', path: p });
    } else {
      setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'multi', path: p });
    }
  };

  const getChildrenAtParent = (nodes: CommandNode[], parentPath: number[]): CommandNode[] => {
    if (parentPath.length === 0) return nodes;
    const { list, index } = getAtPath(nodes, parentPath);
    const parent = list[index];
    return (parent?.children || []) as CommandNode[];
  };
  const deepCloneWithNewIds = (nodes: CommandNode[]): CommandNode[] => {
    // 1) Collect all existing IDs in current tree to avoid collisions
    const used = new Set<string>();
    const walk = (list: CommandNode[]) => {
      for (const n of (list || [])) {
        if (!n) continue;
        if (n.id) used.add(String(n.id));
        if (Array.isArray(n.children)) walk(n.children);
        const p: any = n.parameters || {};
        if (Array.isArray(p.trueCommands)) walk(p.trueCommands as any);
        if (Array.isArray(p.falseCommands)) walk(p.falseCommands as any);
        if (Array.isArray(p.commands)) walk(p.commands as any);
      }
    };
    walk(tree);

    // 1.1) Also collect IDs from entire project (all levels & events),
    // so that IDs remain unique across the whole scene when pasting into events/main
    try {
      const walkJson = (arr: any[]) => {
        (arr || []).forEach((o: any) => {
          if (!o || typeof o !== 'object') return;
          if (o.id) used.add(String(o.id));
          const p: any = o.parameters || {};
          if (Array.isArray(p.trueCommands)) walkJson(p.trueCommands);
          if (Array.isArray(p.falseCommands)) walkJson(p.falseCommands);
          if (Array.isArray(p.commands)) walkJson(p.commands);
        });
      };
      const proj: any = project as any;
      (proj?.levels || []).forEach((lv: any) => {
        const root = Array.isArray(lv?.rawCommands) ? lv.rawCommands : (Array.isArray(lv?.commands) ? lv.commands : []);
        walkJson(root);
        (lv?.events || []).forEach((ev: any) => { if (Array.isArray(ev?.commands)) walkJson(ev.commands); });
      });
    } catch {}

    // 2) Helpers for readable base and unique-generation
    const baseOf = (n: CommandNode): string => {
      const raw = String(n.type || 'cmd').toLowerCase();
      return raw.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'cmd';
    };
    const uniqueId = (base: string): string => {
      let i = 1;
      let id = `${base}_${i}`;
      while (used.has(id)) { i++; id = `${base}_${i}`; }
      used.add(id);
      return id;
    };

    // 3) Clone recursively: keep original id when it doesn't collide; otherwise rename
    const re = (n: CommandNode): CommandNode => {
      let newId = String(n.id || '');
      if (!newId || used.has(newId)) {
        newId = uniqueId(baseOf(n));
      } else {
        used.add(newId);
      }
      return {
        id: newId,
        type: n.type,
        label: n.label,
        kind: n.kind,
        parameters: n.parameters ? { ...n.parameters } : undefined,
        children: (n.children || []).map((c) => re(c))
      };
    };
    return nodes.map((n) => re(n));
  };
  // helper to read from current tree state without mutating
  const withTreeReturn = <T,>(fn: (nodes: CommandNode[]) => T): T => {
    try { return fn(tree.map(cloneNode)); } catch { return fn(tree as any); }
  };
  const copySingle = (path: number[]) => {
    const nodeArr = withTreeReturn(nodes => {
      let cur: any = { children: nodes };
      for (const idx of path) cur = cur.children[idx];
      return [cloneNode(cur)];
    });
    setClipboard({ nodes: nodeArr, cut: false });
    tryWriteClipboard(nodesToJsonText(nodeArr));
  };
  const cutSingle = (path: number[]) => {
    const nodeArr = withTreeReturn(nodes => {
      let cur: any = { children: nodes };
      for (const idx of path) cur = cur.children[idx];
      return [cloneNode(cur)];
    });
    setClipboard({ nodes: nodeArr, cut: true });
    tryWriteClipboard(nodesToJsonText(nodeArr));
    deleteSingle(path);
  };
  const pasteAfterSingle = (path: number[]) => {
    if (!clipboard || !clipboard.nodes || clipboard.nodes.length === 0) return;
    const toInsert = clipboard.cut ? clipboard.nodes.map(cloneNode) : deepCloneWithNewIds(clipboard.nodes);
    withTree(nodes => {
      const parentPath = parentPathOf(path);
      const { list, index } = getAtPath(nodes, path);
      const nl = list.slice();
      // Insert before the current index (上方粘贴)
      nl.splice(index, 0, ...toInsert);
      return replaceAt(nodes, parentPath, nl);
    });
    if (clipboard.cut) setClipboard(null);
  };
  const pasteToParentEnd = (parentPath: number[]) => {
    if (!clipboard || !clipboard.nodes || clipboard.nodes.length === 0) return;
    const toInsert = clipboard.cut ? clipboard.nodes.map(cloneNode) : deepCloneWithNewIds(clipboard.nodes);
    withTree(nodes => {
      if (parentPath.length === 0) {
        const nl = nodes.slice();
        nl.push(...toInsert);
        return nl;
      }
      const { list, index } = getAtPath(nodes, parentPath);
      const parent = list[index];
      const ch = (parent.children || []).slice();
      ch.push(...toInsert);
      const updated = { ...parent, children: ch };
      const nl = list.slice(); nl[index] = updated;
      return replaceAt(nodes, parentPath.slice(0, -1), nl);
    });
    if (clipboard.cut) setClipboard(null);
  };
  const deleteSingle = (path: number[]) => {
    deleteAtPathAndSelectNext(path);
  };
  const copyRange = () => {
    if (!multiSel) return;
    const snap = withTreeReturn(nodes => {
      const list = getChildrenAtParent(nodes, multiSel.parentPath);
      const s = Math.min(multiSel.start, multiSel.end);
      const e = Math.max(multiSel.start, multiSel.end);
      return list.slice(s, e + 1).map(cloneNode);
    });
    setClipboard({ nodes: snap, cut: false });
    tryWriteClipboard(nodesToJsonText(snap));
  };
  const cutRange = () => {
    if (!multiSel) return;
    const snap = withTreeReturn(nodes => {
      const list = getChildrenAtParent(nodes, multiSel.parentPath);
      const s = Math.min(multiSel.start, multiSel.end);
      const e = Math.max(multiSel.start, multiSel.end);
      return list.slice(s, e + 1).map(cloneNode);
    });
    setClipboard({ nodes: snap, cut: true });
    tryWriteClipboard(nodesToJsonText(snap));
    deleteRange();
  };

  const pasteJsonAfterSingle = async (path: number[]) => {
    const text = await tryReadClipboard();
    if (!text) return;
    const nodes = jsonTextToNodes(text);
    if (!nodes.length) return;
    const toInsert = deepCloneWithNewIds(nodes);
    withTree(prev => {
      const { list, index } = getAtPath(prev, path);
      const nl = list.slice();
      // Insert before current index
      nl.splice(index, 0, ...toInsert);
      return replaceAt(prev, path.slice(0, -1), nl);
    });
  };
  const pasteJsonToParentEnd = async (parentPath: number[]) => {
    const text = await tryReadClipboard();
    if (!text) return;
    const nodes = jsonTextToNodes(text);
    if (!nodes.length) return;
    const toInsert = deepCloneWithNewIds(nodes);
    withTree(prev => {
      if (parentPath.length === 0) {
        const nl = prev.slice(); nl.push(...toInsert); return nl;
      }
      const { list, index } = getAtPath(prev, parentPath);
      const parent = list[index];
      const ch = (parent.children || []).slice(); ch.push(...toInsert);
      const updated = { ...parent, children: ch };
      const nl = list.slice(); nl[index] = updated;
      return replaceAt(prev, parentPath.slice(0, -1), nl);
    });
  };
  const deleteRange = () => {
    if (!multiSel) return;
    withTree(nodes => {
      const s = Math.min(multiSel.start, multiSel.end);
      const e = Math.max(multiSel.start, multiSel.end);
      const list = getChildrenAtParent(nodes, multiSel.parentPath);
      const nl = list.slice();
      nl.splice(s, e - s + 1);
      return replaceAt(nodes, multiSel.parentPath, nl);
    });
    setSelectedPath(null);
    setMultiSel(null);
  };

  // Keyboard shortcuts: Ctrl/Cmd + C/X/V for copy/cut/paste
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectIdRef = useRef<string | null>(null);
  const isTextInputLike = (el: Element | null): boolean => {
    if (!el) return false;
    const tag = (el as HTMLElement).tagName?.toLowerCase();
    const editable = (el as HTMLElement).isContentEditable;
    return editable || tag === 'input' || tag === 'textarea' || tag === 'select';
  };
  const moveSelectionBy = (delta: -1 | 1) => {
    // Skip placeholders and branch headers; only land on real action commands
    const isActionLine = (li: LineItem) => !!li.node && li.node.kind === 'action';
    const actionLines = lines.filter(isActionLine);
    if (actionLines.length === 0) return;

    // Locate current index in the full lines list (so we can step past placeholders/branches)
    const findCurrentIndex = (): number => {
      if (selectedPath) {
        const i = lines.findIndex(li => li.path && eqArr(li.path, selectedPath));
        if (i >= 0) return i;
      }
      if (selectedPlaceholder) {
        const i = lines.findIndex(li => !!li.placeholder && eqArr(li.parentPath || [], selectedPlaceholder));
        if (i >= 0) return i;
      }
      return -1;
    };

    const cur = findCurrentIndex();
    if (cur < 0) {
      // No current focus: always select the first action line
      const p = actionLines[0].path || null;
      if (p) { setSelectedPath(p); setMultiSel(null); setSelectedPlaceholder(null); }
      return;
    }

    // Step in the requested direction until we hit an action line, skipping placeholders/branch rows
    let j = cur + delta;
    while (j >= 0 && j < lines.length && !isActionLine(lines[j])) {
      j += delta;
    }
    if (j >= 0 && j < lines.length && lines[j].path) {
      setSelectedPath(lines[j].path!);
      setMultiSel(null);
      setSelectedPlaceholder(null);
    }
  };
  const deleteAtPathAndSelectNext = (path: number[]) => {
    // 基于层级结构选择“同级下一条”（若无则上一条）；不依赖扁平列表，避免选到被删节点的子分支
    const parentPath = path.slice(0, -1);
    const delIndex = path[path.length - 1];
    // 使用当前树状态计算同级列表长度
    const siblings = getChildrenAtParent(tree, parentPath);
    const len = siblings.length;
    let nextPath: number[] | null = null;
    if (len > 1) {
      const nextIndex = (delIndex < len - 1) ? delIndex : (delIndex - 1);
      nextPath = [...parentPath, nextIndex];
    } else {
      nextPath = null; // 该层级已空
    }

    withTree(nodes => {
      const { list, index } = getAtPath(nodes, path);
      const nl = list.slice();
      nl.splice(index, 1);
      return replaceAt(nodes, parentPath, nl);
    });
    // 直接切换到计算好的同级节点（若存在）
    setSelectedPath(nextPath);
    setSelectedPlaceholder(null);
    setMultiSel(null);
  };
  const deleteRangeAndSelect = () => {
    if (!multiSel) return;
    const s = Math.min(multiSel.start, multiSel.end);
    const e = Math.max(multiSel.start, multiSel.end);
    const parentPath = multiSel.parentPath.slice();
    let next: number[] | null = null;
    withTree(nodes => {
      const list = getChildrenAtParent(nodes, parentPath);
      const nl = list.slice();
      nl.splice(s, e - s + 1);
      const newLen = nl.length;
      if (newLen > 0) {
        const ni = Math.min(s, newLen - 1);
        next = [...parentPath, ni];
      } else {
        next = null;
      }
      return replaceAt(nodes, parentPath, nl);
    });
    setSelectedPath(next);
    setSelectedPlaceholder(null);
    setMultiSel(null);
  };
  const deleteByKey = () => {
    if (multiSel) { deleteRangeAndSelect(); return; }
    if (selectedPath) { deleteAtPathAndSelectNext(selectedPath); }
  };
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = async (e) => {
    // don't interfere when editing params dialog or typing in inputs
    if (editing) return;
    const active = (document?.activeElement || null) as Element | null;
    if (isTextInputLike(active)) return;
    const mod = e.metaKey || e.ctrlKey;
    const keyRaw = String(e.key || '');
    const k = keyRaw.toLowerCase();
    if (mod) {
      if (k === 'c') { e.preventDefault(); e.stopPropagation(); if (multiSel) copyRange(); else if (selectedPath) copySingle(selectedPath); return; }
      if (k === 'x') { e.preventDefault(); e.stopPropagation(); if (multiSel) cutRange(); else if (selectedPath) cutSingle(selectedPath); return; }
      if (k === 'v') {
        e.preventDefault(); e.stopPropagation();
        const hasObj = !!(clipboard && clipboard.nodes && clipboard.nodes.length);
        if (hasObj) {
          if (selectedPlaceholder) pasteToParentEnd(selectedPlaceholder);
          else if (selectedPath) pasteAfterSingle(selectedPath);
          else pasteToParentEnd([]);
        } else {
          // 无对象可粘贴时，回落到 JSON 文本粘贴
          if (selectedPlaceholder) await pasteJsonToParentEnd(selectedPlaceholder);
          else if (selectedPath) await pasteJsonAfterSingle(selectedPath);
          else await pasteJsonToParentEnd([]);
        }
        return;
      }
      return;
    }
    if (keyRaw === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); moveSelectionBy(-1); return; }
    if (keyRaw === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moveSelectionBy(1); return; }
    if (keyRaw === 'Backspace') { e.preventDefault(); e.stopPropagation(); deleteByKey(); return; }
    if (keyRaw === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (selectedPath) {
        try {
          const findNode = (nodes: CommandNode[], path: number[]): CommandNode => {
            let cur: any = { children: nodes };
            for (const i of path) cur = cur.children[i];
            return cur;
          };
          const n = findNode(tree, selectedPath);
          if (n && n.kind === 'action' && tplForType(n.type)) {
            setEditing({ path: selectedPath });
          }
        } catch {}
      }
      return;
    }
  };

  // Fallback: global keydown in case container doesn't get focus (e.g., static dist)
  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      if (editing) return;
      const active = (document?.activeElement || null) as Element | null;
      if (isTextInputLike(active)) return;
      const mod = e.metaKey || e.ctrlKey;
      const keyRaw = String((e as any).key || '');
      const k = keyRaw.toLowerCase();
      if (mod) {
        if (k === 'c') { e.preventDefault(); e.stopPropagation(); if (multiSel) copyRange(); else if (selectedPath) copySingle(selectedPath); return; }
        if (k === 'x') { e.preventDefault(); e.stopPropagation(); if (multiSel) cutRange(); else if (selectedPath) cutSingle(selectedPath); return; }
        if (k === 'v') { e.preventDefault(); e.stopPropagation(); if (selectedPlaceholder) pasteToParentEnd(selectedPlaceholder); else if (selectedPath) pasteAfterSingle(selectedPath); else pasteToParentEnd([]); return; }
        return;
      }
      if (keyRaw === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); moveSelectionBy(-1); return; }
      if (keyRaw === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moveSelectionBy(1); return; }
      if (keyRaw === 'Backspace') { e.preventDefault(); e.stopPropagation(); deleteByKey(); return; }
      if (keyRaw === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (selectedPath) {
          try {
            const findNode = (nodes: CommandNode[], path: number[]): CommandNode => {
              let cur: any = { children: nodes };
              for (const i of path) cur = cur.children[i];
              return cur;
            };
            const n = findNode(tree, selectedPath);
            if (n && n.kind === 'action' && tplForType(n.type)) {
              setEditing({ path: selectedPath });
            }
          } catch {}
        }
        return;
      }
    };
    window.addEventListener('keydown', onWinKey);
    return () => window.removeEventListener('keydown', onWinKey);
  }, [editing, selectedPath, selectedPlaceholder, multiSel]);

  // Auto-scroll: keep selected row visible inside the list container
  useEffect(() => {
    if (!selectedPath || !listRef.current) return;
    const key = selectedPath.join('-');
    const listEl = listRef.current;
    try {
      const el = listEl.querySelector(`[data-path="${key}"]`) as HTMLElement | null;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } catch {}
  }, [selectedPath, lines.length]);

  // 若存在待选中的目标 ID，在行列表刷新后恢复选中（用于删除后的“选中下一条”）
  useEffect(() => {
    const targetId = pendingSelectIdRef.current;
    if (!targetId) return;
    for (const li of lines) {
      if (li.node && li.node.id === targetId && li.path) {
        setSelectedPath(li.path);
        pendingSelectIdRef.current = null;
        break;
      }
    }
  }, [JSON.stringify(lines.map(li => (li.node ? li.node.id : `ph:${(li.parentPath||[]).join('-')}`))) ]);

  return (
    <div
      ref={containerRef}
      className="ctp"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={() => { try { containerRef.current?.focus(); } catch {} }}
      onClick={() => setCtxMenu(null)}
    >
      <div className="ctp-toolbar">
        <button onClick={() => setInsertTarget({ path: selectedPath || [], mode: 'sibling' })}>＋ 添加指令</button>
        <button onClick={() => { if (selectedPath) moveSibling(selectedPath, -1); }} disabled={!selectedPath}>↑ 上移</button>
        <button onClick={() => { if (selectedPath) moveSibling(selectedPath, 1); }} disabled={!selectedPath}>↓ 下移</button>
        <button onClick={() => { if (multiSel) { deleteRangeAndSelect(); } else if (selectedPath) { deleteAtPathAndSelectNext(selectedPath); } }} disabled={!selectedPath && !multiSel}>删除</button>
        <button onClick={() => setShowRaw(s => !s)} style={{ marginLeft: 8 }}>{showRaw ? '显示树' : '显示源数据'}</button>
        {showRaw && (
          <button onClick={copyRaw} title="复制 JSON">
            {copiedRaw === 'ok' ? '已复制' : copiedRaw === 'err' ? '复制失败' : '复制' }
          </button>
        )}
      </div>

      {ctxMenu && (
        <div
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: '#fff', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', zIndex: 2147483647, minWidth: 160 }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.mode === 'single' && (
            <>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { copySingle(ctxMenu.path); setCtxMenu(null); }}>复制</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { cutSingle(ctxMenu.path); setCtxMenu(null); }}>剪切</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', opacity: clipboard && clipboard.nodes && clipboard.nodes.length ? 1 : 0.5 }} disabled={!clipboard || !clipboard.nodes || clipboard.nodes.length===0} onClick={() => { pasteAfterSingle(ctxMenu.path); setCtxMenu(null); }}>粘贴</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={async () => { await pasteJsonAfterSingle(ctxMenu.path); setCtxMenu(null); }}>从JSON粘贴</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', color:'#c00' }} onClick={() => { deleteSingle(ctxMenu.path); setCtxMenu(null); }}>删除</button>
            </>
          )}
          {ctxMenu.mode === 'placeholder' && (
            <>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', opacity: clipboard && clipboard.nodes && clipboard.nodes.length ? 1 : 0.5 }} disabled={!clipboard || !clipboard.nodes || clipboard.nodes.length===0} onClick={() => { pasteToParentEnd(ctxMenu.path); setCtxMenu(null); }}>粘贴</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={async () => { await pasteJsonToParentEnd(ctxMenu.path); setCtxMenu(null); }}>从JSON粘贴</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { const pp = ctxMenu.path; if ((pp||[]).length === 0) setInsertTarget({ path: [], mode: 'sibling' }); else setInsertTarget({ path: pp, mode: 'child' }); setCtxMenu(null); }}>新建指令</button>
            </>
          )}
          {ctxMenu.mode === 'multi' && (
            <>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { copyRange(); setCtxMenu(null); }}>复制所选</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent' }} onClick={() => { cutRange(); setCtxMenu(null); }}>剪切所选</button>
              <button className="ph-menu-item" style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', color:'#c00' }} onClick={() => { deleteRange(); setCtxMenu(null); }}>删除所选</button>
            </>
          )}
        </div>
      )}
      <div className="ctp-list" ref={listRef} onClick={(e) => { if (e.currentTarget === e.target) { setSelectedPath(null); setMultiSel(null); setSelectedPlaceholder(null); setCtxMenu(null); } }}>
        {showRaw && (
          <div className="ctp-raw" style={{ padding: 8 }}>
            <div className="ctp-raw-box">
              <pre className="ctp-raw-pre"><code className="ctp-raw-code" dangerouslySetInnerHTML={{ __html: highlightedRaw }} /></pre>
            </div>
          </div>
        )}
        {!showRaw && lines.length === 0 && <div className="clp-empty">暂无指令，点击“添加命令”</div>}
        {!showRaw && lines.map((li, idx) => {
          if (li.placeholder) {
            const key = `ph|${(li.parentPath || []).join('-')}|${idx}`;
            const onDbl = () => {
              const pp = li.parentPath || [];
              if (pp.length === 0) setInsertTarget({ path: [], mode: 'sibling' });
              else setInsertTarget({ path: pp, mode: 'child' });
            };
            const onCtx = (e: React.MouseEvent) => {
              e.preventDefault(); e.stopPropagation();
              setCtxMenu({ x: e.clientX, y: e.clientY, mode: 'placeholder', path: li.parentPath || [] });
            };
            return (
              <div
                key={key}
                className={`ctp-row placeholder ${selectedPlaceholder && eqArr(selectedPlaceholder, li.parentPath || []) ? 'selected' : ''}`}
                style={{ marginLeft: li.depth * 16 }}
                onClick={(e) => { e.stopPropagation(); setSelectedPath(null); setMultiSel(null); setCtxMenu(null); setSelectedPlaceholder(li.parentPath || []); }}
                onDoubleClick={onDbl}
                onContextMenu={onCtx}
              >
                <div className="ctp-toggle" />
                <div className="ctp-icon">＋</div>
                <div className="ctp-main">
                  <span className="ctp-summary" style={{ color:'#999' }}>空白（右键粘贴 / 双击新建）</span>
                </div>
                <div className="ctp-actions" />
              </div>
            );
          }
          const n = li.node!; const p = li.path!;
          const isExecuting = runtimeStatus && runtimeStatus.id && runtimeStatus.id === n.id;
          const execClass = isExecuting ? (runtimeStatus!.status === 'error' ? 'exec-error' : runtimeStatus!.status === 'start' ? 'exec-running' : 'exec-done') : '';
          return (
            <div
              key={n.id + '|' + p.join('-')}
              data-path={p.join('-')}
              className={`ctp-row ${n.kind === 'branch' ? 'branch' : ''} ${selectedPath && eqArr(selectedPath, p) ? 'selected' : ''} ${isInMultiRange(p) ? 'in-range' : ''} ${execClass}`}
              style={{ marginLeft: li.depth * 16 }}
              onClick={(e) => handleRowClick(e, p)}
              onContextMenu={(e) => handleContextMenu(e, p)}
              onDoubleClick={() => { if (n.kind === 'action' && tplForType(n.type)) setEditing({ path: p }); }}
            >
              <div className="ctp-toggle" onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>{(n.children?.length || 0) > 0 ? (folded.has(n.id) ? '▶' : '▼') : ''}</div>
              <div className="ctp-icon">{iconOf(n)}</div>
              <div className="ctp-main">
                {n.kind === 'branch' && <span className="ctp-badge">{n.label || '分支'}</span>}
                <span className="ctp-title">{titleOf(n)}</span>
                <span className="ctp-summary">{summaryOf(n)}</span>
              </div>
              <div className="ctp-actions">
                {n.kind === 'action' && tplForType(n.type) && (
                  <button onClick={() => setEditing({ path: p })}>参数</button>
                )}
                {n.kind === 'action' && n.type === 'SHOW_CHOICES' && (
                  <button onClick={(e) => {
                    e.stopPropagation();
                    withTree(nodes => {
                      const { list, index } = getAtPath(nodes, p);
                      const me = list[index];
                      const ch = (me.children || []).slice();
                      const nextIdx = ch.length + 1;
                      ch.push({ id: `${me.id}_opt_${nextIdx}`, type: 'BRANCH', label: `选项${nextIdx}`, kind: 'branch', children: [] });
                      const updated = { ...me, children: ch };
                      const nl = list.slice(); nl[index] = updated; return replaceAt(nodes, p.slice(0, -1), nl);
                    });
                  }}>添加选项</button>
                )}
                {n.kind === 'branch' && (
                  <>
                    <button onClick={() => setInsertTarget({ path: p, mode: 'child' })}>添加</button>
                    {(() => {
                      try {
                        const parentPath = p.slice(0, -1);
                        const { list: plist, index: pidx } = getAtPath(tree as any, parentPath);
                        const parentNode = plist?.[pidx];
                        const isChoiceOpt = parentNode && parentNode.type === 'SHOW_CHOICES';
                        const count = isChoiceOpt ? ((parentNode.children || []).length) : 0;
                        if (!isChoiceOpt || count <= 1) return null; // 仅在>1个选项时允许删除
                        return (
                          <button onClick={(e) => {
                            e.stopPropagation();
                            withTree(nodes => {
                              const childIndex = p[p.length - 1];
                              const parentPath2 = p.slice(0, -1);
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
                    {(() => {
                      try {
                        const parentPath = p.slice(0, -1);
                        const { list: plist, index: pidx } = getAtPath(tree as any, parentPath);
                        const parentNode = plist?.[pidx];
                        const isChoiceOpt = parentNode && parentNode.type === 'SHOW_CHOICES';
                        if (!isChoiceOpt) return null;
                        return (
                          <button onClick={(e) => {
                            e.stopPropagation();
                            const oldLabel = String(n.label || '');
                            let name = oldLabel;
                            try { const v = window.prompt('重命名选项', oldLabel); if (v && v.trim()) name = v.trim(); else return; } catch { return; }
                            withTree(nodes => {
                              const childIndex = p[p.length - 1];
                              const { list: parentList2, index: parentIndex2 } = getAtPath(nodes, parentPath);
                              const parentNode2 = parentList2[parentIndex2];
                              const children2 = (parentNode2.children || []).map(cloneNode);
                              if (children2[childIndex]) children2[childIndex].label = name;
                              return replaceAt(nodes, parentPath, children2);
                            });
                          }}>重命名</button>
                        );
                      } catch { return null; }
                    })()}
                  </>
                )}
              </div>
            </div>
          );
        })}
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
                        // Insert above the selected node (before current index)
                        newPath = [...parentPath, index];
                        const nl = list.slice(); nl.splice(index, 0, node);
                        return replaceAt(nodes, parentPath, nl);
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
                  setPendingNewPath(newPath);
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
            commandId={n.id}
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
              setPendingNewPath(null);
            }}
            onCancel={() => {
              if (pendingNewPath && JSON.stringify(pendingNewPath) === JSON.stringify(editing.path)) {
                // remove the newly inserted node
                delSubtree(pendingNewPath);
                setPendingNewPath(null);
              }
              setEditing(null);
            }}
          />
        );
        return onEditor;
      })()}
    </div>
  );
};

export default CommandTreePanel;
