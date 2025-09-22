import { GameCommand, CommandType } from '../types';

export type NodeKind = 'action' | 'branch';

export interface CommandNode {
  id: string;
  type: string; // raw type string
  label?: string; // for branch nodes (是/否/选项/条件成立时/条件不成立时)
  kind: NodeKind;
  parameters?: any;
  children: CommandNode[];
}

// -------- Transform JSON -> Tree (MV 风格) --------
export function jsonToTree(list: any[]): CommandNode[] {
  const build = (cmd: any): CommandNode => {
    const typeRaw: string = typeof cmd?.type === 'string' ? cmd.type : '';
    const up = typeRaw.toUpperCase();
    const upNorm = up; // 取消对 CHOICES 的兼容映射，仅支持 SHOW_CHOICES
    // Avoid mutating source JSON: clone parameters shallowly
    const rawParams: any = (cmd && typeof cmd === 'object' && cmd.parameters && typeof cmd.parameters === 'object') ? cmd.parameters : {};
    const paramsClone: any = { ...rawParams };
    const node: CommandNode = {
      id: cmd.id || `cmd_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      type: upNorm,
      kind: 'action',
      parameters: paramsClone,
      children: []
    };
    // IF_CONDITION branches: always show two branches in tree (empty when missing)
    if (up === 'IF_CONDITION') {
      const p = node.parameters || {};
      const trueArr = Array.isArray(rawParams.trueCommands) ? rawParams.trueCommands : Array.isArray(p.trueCommands) ? p.trueCommands : [];
      const falseArr = Array.isArray(rawParams.falseCommands) ? rawParams.falseCommands : Array.isArray(p.falseCommands) ? p.falseCommands : [];
      node.children.push({ id: `${node.id}_b_true`, type: 'BRANCH', label: '条件成立时', kind: 'branch', children: (trueArr || []).map(build) });
      node.children.push({ id: `${node.id}_b_false`, type: 'BRANCH', label: '条件不成立时', kind: 'branch', children: (falseArr || []).map(build) });
      // Remove from parameters of node only (do not mutate source)
      if ('trueCommands' in p) delete (p as any).trueCommands;
      if ('falseCommands' in p) delete (p as any).falseCommands;
    }
    // CHECK_IN_AREA → commands branch: '命中时'
    if (up === 'CHECK_IN_AREA') {
      const p = node.parameters || {};
      const arr = Array.isArray((rawParams as any)?.commands) ? (rawParams as any).commands : Array.isArray((p as any)?.commands) ? (p as any).commands : [];
      node.children.push({ id: `${node.id}_hit`, type: 'BRANCH', label: '命中时', kind: 'branch', children: (arr || []).map(build) });
      if ('commands' in p) delete (p as any).commands;
    }
    // SHOW_BUTTON → yes/no + options
    if (up === 'SHOW_BUTTON' || up === 'BUTTON') {
      const branches = (cmd as any).branches || (rawParams || {}).branches || (node.parameters || {}).branches;
      if (branches) {
        if (Array.isArray(branches.yes?.commands)) node.children.push({ id: `${node.id}_b_yes`, type: 'BRANCH', label: branches.yes.label || '是', kind: 'branch', children: branches.yes.commands.map(build) });
        if (Array.isArray(branches.no?.commands)) node.children.push({ id: `${node.id}_b_no`, type: 'BRANCH', label: branches.no.label || '否', kind: 'branch', children: branches.no.commands.map(build) });
      }
      const opts: any[] = (rawParams?.options || rawParams?.choices || node.parameters?.options || node.parameters?.choices || (cmd as any).options || []) as any[];
      if (Array.isArray(opts)) {
        opts.forEach((opt: any, idx: number) => {
          if (Array.isArray(opt?.commands)) node.children.push({ id: `${node.id}_opt_${idx}`, type: 'BRANCH', label: opt.text || opt.label || `选项${idx + 1}`, kind: 'branch', children: opt.commands.map(build) });
        });
      }
    }
    // SET_SELECTABLE → two branches
    if (up === 'SET_SELECTABLE') {
      const p = node.parameters || {} as any;
      const a1 = Array.isArray((rawParams as any)?.onSelectedCommands) ? (rawParams as any).onSelectedCommands : Array.isArray((p as any)?.onSelectedCommands) ? (p as any).onSelectedCommands : [];
      const a2 = Array.isArray((rawParams as any)?.onCancelSelectedCommands) ? (rawParams as any).onCancelSelectedCommands : Array.isArray((p as any)?.onCancelSelectedCommands) ? (p as any).onCancelSelectedCommands : [];
      node.children.push({ id: `${node.id}_sel_on`, type: 'BRANCH', label: '选中时', kind: 'branch', children: (a1 || []).map(build) });
      node.children.push({ id: `${node.id}_sel_off`, type: 'BRANCH', label: '取消选中时', kind: 'branch', children: (a2 || []).map(build) });
      if ('onSelectedCommands' in p) delete (p as any).onSelectedCommands;
      if ('onCancelSelectedCommands' in p) delete (p as any).onCancelSelectedCommands;
    }
    // SET_CLICKABLE → commands branch when onClick=commands
    if (up === 'SET_CLICKABLE') {
      const p = node.parameters || {} as any;
      const onClick = String((rawParams as any)?.onClick ?? (p as any)?.onClick ?? '').toLowerCase();
      if (onClick === 'commands') {
        const arr = Array.isArray((rawParams as any)?.commands) ? (rawParams as any).commands : Array.isArray((p as any)?.commands) ? (p as any).commands : [];
        node.children.push({ id: `${node.id}_on_click`, type: 'BRANCH', label: '点击时', kind: 'branch', children: (arr || []).map(build) });
        if ('commands' in p) delete (p as any).commands;
      }
    }
    // LOOP → commands as a single branch (循环体): always show branch (empty when missing)
    if (up === 'LOOP') {
      const p = node.parameters || {};
      const body: any[] = Array.isArray((p as any).commands) ? (p as any).commands : Array.isArray((cmd as any).commands) ? (cmd as any).commands : [];
      node.children.push({ id: `${node.id}_body`, type: 'BRANCH', label: '循环体', kind: 'branch', children: (body || []).map(build) });
      if ('commands' in p) delete (p as any).commands;
    }
    // SHOW_CHOICES → options: render branches;
    if (upNorm === 'SHOW_CHOICES') {
      const opts: any[] = (rawParams?.options || rawParams?.choices || node.parameters?.options || node.parameters?.choices || (cmd as any).options || []) as any[];
      const cntRaw = (node.parameters as any)?.optionsCount;
      const desired = Math.max(1, Number((cntRaw != null ? cntRaw : (Array.isArray(opts) ? opts.length : 0)) || 2));
      const length = Math.max(Array.isArray(opts) ? opts.length : 0, desired);
      for (let i = 0; i < length; i++) {
        const opt = Array.isArray(opts) ? opts[i] : undefined;
        const label = opt?.text || opt?.label || `选项${i + 1}`;
        const children = Array.isArray(opt?.commands) ? opt.commands.map(build) : [];
        node.children.push({ id: `${node.id}_opt_${i + 1}`, type: 'BRANCH', label, kind: 'branch', children });
      }
    }
    // NOTE: SET_CLICKABLE branch logic handled above (only when onClick==='commands')
    return node;
  };
  return Array.isArray(list) ? list.map(build) : [];
}

// -------- Transform Tree -> JSON (nested) --------
export function treeToJson(nodes: CommandNode[]): any[] {
  const toCmd = (n: CommandNode): any => {
    if (n.kind === 'branch') {
      // branch container shouldn't be serialized as a command; handled in parent
      return null;
    }
    const out: any = { id: n.id, type: n.type, parameters: { ...(n.parameters || {}) } };
    if (n.type === 'IF_CONDITION') {
      // collect known branch labels
      const trueNode = n.children.find(c => c.kind === 'branch' && (c.label === '条件成立时'));
      const falseNode = n.children.find(c => c.kind === 'branch' && (c.label === '条件不成立时'));
      if (trueNode) out.parameters.trueCommands = trueNode.children.map(c => toCmd(c)).filter(Boolean);
      if (falseNode) out.parameters.falseCommands = falseNode.children.map(c => toCmd(c)).filter(Boolean);
    }
    if (n.type === 'SHOW_BUTTON') {
      const yesNode = n.children.find(c => c.kind === 'branch' && (c.label === '是'));
      const noNode = n.children.find(c => c.kind === 'branch' && (c.label === '否'));
      out.branches = out.branches || {};
      out.branches.yes = { label: yesNode?.label || '是', commands: yesNode ? yesNode.children.map(c => toCmd(c)).filter(Boolean) : [] };
      out.branches.no = { label: noNode?.label || '否', commands: noNode ? noNode.children.map(c => toCmd(c)).filter(Boolean) : [] };
      // options from branches with other labels (选项N)
      const opts = n.children.filter(c => c.kind === 'branch' && c.label && c.label !== '是' && c.label !== '否').map(c => ({ text: c.label, commands: c.children.map(cc => toCmd(cc)).filter(Boolean) }));
      (out.parameters as any).options = opts; // 始终生成 options 数组（可为空）
    }
    if (n.type === 'SET_SELECTABLE') {
      const onNode = n.children.find(c => c.kind === 'branch' && (c.label === '选中时'));
      const offNode = n.children.find(c => c.kind === 'branch' && (c.label === '取消选中时'));
      (out.parameters as any).onSelectedCommands = onNode ? onNode.children.map(c => toCmd(c)).filter(Boolean) : [];
      (out.parameters as any).onCancelSelectedCommands = offNode ? offNode.children.map(c => toCmd(c)).filter(Boolean) : [];
    }
    if (n.type === 'SHOW_CHOICES') {
      const opts = n.children.filter(c => c.kind === 'branch').map(c => ({ text: c.label, commands: c.children.map(cc => toCmd(cc)).filter(Boolean) }));
      (out.parameters as any).options = opts;
      // 清理编辑器中可能遗留的 choices 简写，统一输出 options
      if ((out.parameters as any).choices) delete (out.parameters as any).choices;
    }
    if (n.type === 'SET_CLICKABLE') {
      const clickNode = n.children.find(c => c.kind === 'branch' && (c.label === '点击时'));
      const onClick = String((out.parameters as any)?.onClick || '').toLowerCase();
      if (onClick === 'commands') {
        (out.parameters as any).commands = clickNode ? clickNode.children.map(c => toCmd(c)).filter(Boolean) : [];
      }
    }
    if (n.type === 'LOOP') {
      const body = n.children.find(c => c.kind === 'branch' && (c.label === '循环体'));
      (out.parameters as any).commands = body ? body.children.map(c => toCmd(c)).filter(Boolean) : [];
    }
    if (n.type === 'CHECK_IN_AREA') {
      const hit = n.children.find(c => c.kind === 'branch' && (c.label === '命中时'));
      (out.parameters as any).commands = hit ? hit.children.map(c => toCmd(c)).filter(Boolean) : [];
    }
    return out;
  };
  return (nodes || []).map(n => toCmd(n)).filter(Boolean);
}

// -------- Helpers for subtree operations on flattened list with depth --------
export function getSubtreeRangeByDepth(list: Array<{ depth?: number }>, index: number): [number, number] {
  const base = Math.max(0, list[index]?.depth || 0);
  let end = index + 1;
  while (end < list.length) {
    const d = Math.max(0, list[end]?.depth || 0);
    if (d <= base) break;
    end++;
  }
  return [index, end];
}
