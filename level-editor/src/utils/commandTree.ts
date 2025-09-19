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
    const upNorm = (up === 'CHOICES') ? 'SHOW_CHOICES' : up;
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
    // LOOP → commands as a single branch (循环体): always show branch (empty when missing)
    if (up === 'LOOP') {
      const p = node.parameters || {};
      const body: any[] = Array.isArray((p as any).commands) ? (p as any).commands : Array.isArray((cmd as any).commands) ? (cmd as any).commands : [];
      node.children.push({ id: `${node.id}_body`, type: 'BRANCH', label: '循环体', kind: 'branch', children: (body || []).map(build) });
      if ('commands' in p) delete (p as any).commands;
    }
    // SHOW_CHOICES → options: always show option branches
    if (upNorm === 'SHOW_CHOICES') {
      const opts: any[] = (rawParams?.options || rawParams?.choices || node.parameters?.options || node.parameters?.choices || (cmd as any).options || []) as any[];
      if (Array.isArray(opts) && opts.length > 0) {
        opts.forEach((opt: any, idx: number) => {
          const label = opt?.text || opt?.label || `选项${idx + 1}`;
          const children = Array.isArray(opt?.commands) ? opt.commands.map(build) : [];
          node.children.push({ id: `${node.id}_opt_${idx + 1}`, type: 'BRANCH', label, kind: 'branch', children });
        });
      } else {
        // create placeholder branches based on optionsCount (default 2)
        const cntRaw = (node.parameters as any)?.optionsCount;
        const count = Math.max(1, Number(cntRaw != null ? cntRaw : 2));
        for (let i = 0; i < count; i++) {
          node.children.push({ id: `${node.id}_opt_${i + 1}`, type: 'BRANCH', label: `选项${i + 1}`, kind: 'branch', children: [] });
        }
      }
    }
    // SET_CLICKABLE → onClick=commands: show a single branch for click body
    if (up === 'SET_CLICKABLE') {
      const p = node.parameters || {};
      const cmdArr = Array.isArray(rawParams?.commands) ? rawParams.commands : Array.isArray(p?.commands) ? p.commands : [];
      if (Array.isArray(cmdArr) && cmdArr.length > 0) {
        node.children.push({ id: `${node.id}_on_click`, type: 'BRANCH', label: '点击时', kind: 'branch', children: cmdArr.map(build) });
      }
      if ('commands' in p) delete (p as any).commands;
    }
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
      if (yesNode || noNode) {
        out.branches = {};
        if (yesNode) out.branches.yes = { label: yesNode.label, commands: yesNode.children.map(c => toCmd(c)).filter(Boolean) };
        if (noNode) out.branches.no = { label: noNode.label, commands: noNode.children.map(c => toCmd(c)).filter(Boolean) };
      }
      // options from branches with other labels (选项N)
      const opts = n.children.filter(c => c.kind === 'branch' && c.label && c.label !== '是' && c.label !== '否').map(c => ({ text: c.label, commands: c.children.map(cc => toCmd(cc)).filter(Boolean) }));
      if (opts.length) out.parameters.options = opts;
    }
    if (n.type === 'SET_SELECTABLE') {
      const onNode = n.children.find(c => c.kind === 'branch' && (c.label === '选中时'));
      const offNode = n.children.find(c => c.kind === 'branch' && (c.label === '取消选中时'));
      if (onNode) (out.parameters as any).onSelectedCommands = onNode.children.map(c => toCmd(c)).filter(Boolean);
      if (offNode) (out.parameters as any).onCancelSelectedCommands = offNode.children.map(c => toCmd(c)).filter(Boolean);
    }
    if (n.type === 'SHOW_CHOICES') {
      const opts = n.children.filter(c => c.kind === 'branch').map(c => ({ text: c.label, commands: c.children.map(cc => toCmd(cc)).filter(Boolean) }));
      if (opts.length) out.parameters.options = opts;
    }
    if (n.type === 'SET_CLICKABLE') {
      const clickNode = n.children.find(c => c.kind === 'branch' && (c.label === '点击时'));
      if (clickNode) (out.parameters as any).commands = clickNode.children.map(c => toCmd(c)).filter(Boolean);
    }
    if (n.type === 'LOOP') {
      const body = n.children.find(c => c.kind === 'branch' && (c.label === '循环体'));
      if (body) (out.parameters as any).commands = body.children.map(c => toCmd(c)).filter(Boolean);
    }
    if (n.type === 'CHECK_IN_AREA') {
      const hit = n.children.find(c => c.kind === 'branch' && (c.label === '命中时'));
      if (hit) (out.parameters as any).commands = hit.children.map(c => toCmd(c)).filter(Boolean);
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
