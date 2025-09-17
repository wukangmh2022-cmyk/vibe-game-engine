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
    // Avoid mutating source JSON: clone parameters shallowly
    const rawParams: any = (cmd && typeof cmd === 'object' && cmd.parameters && typeof cmd.parameters === 'object') ? cmd.parameters : {};
    const paramsClone: any = { ...rawParams };
    const node: CommandNode = {
      id: cmd.id || `cmd_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      type: up,
      kind: 'action',
      parameters: paramsClone,
      children: []
    };
    // IF_CONDITION branches
    if (up === 'IF_CONDITION') {
      const p = node.parameters || {};
      const trueArr = Array.isArray(rawParams.trueCommands) ? rawParams.trueCommands : Array.isArray(p.trueCommands) ? p.trueCommands : [];
      const falseArr = Array.isArray(rawParams.falseCommands) ? rawParams.falseCommands : Array.isArray(p.falseCommands) ? p.falseCommands : [];
      if (Array.isArray(trueArr) && trueArr.length) {
        node.children.push({ id: `${node.id}_b_true`, type: 'BRANCH', label: '条件成立时', kind: 'branch', children: trueArr.map(build) });
      }
      if (Array.isArray(falseArr) && falseArr.length) {
        node.children.push({ id: `${node.id}_b_false`, type: 'BRANCH', label: '条件不成立时', kind: 'branch', children: falseArr.map(build) });
      }
      // Remove from parameters of node only (do not mutate source)
      if ('trueCommands' in p) delete (p as any).trueCommands;
      if ('falseCommands' in p) delete (p as any).falseCommands;
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
    // SHOW_CHOICES/CHOICES → options
    if (up === 'SHOW_CHOICES' || up === 'CHOICES') {
      const opts: any[] = (rawParams?.options || rawParams?.choices || node.parameters?.options || node.parameters?.choices || (cmd as any).options || []) as any[];
      if (Array.isArray(opts)) {
        opts.forEach((opt: any, idx: number) => {
          if (Array.isArray(opt?.commands)) node.children.push({ id: `${node.id}_opt_${idx}`, type: 'BRANCH', label: opt.text || opt.label || `选项${idx + 1}`, kind: 'branch', children: opt.commands.map(build) });
        });
      }
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
    if (n.type === 'SHOW_CHOICES' || n.type === 'CHOICES') {
      const opts = n.children.filter(c => c.kind === 'branch').map(c => ({ text: c.label, commands: c.children.map(cc => toCmd(cc)).filter(Boolean) }));
      if (opts.length) out.parameters.options = opts;
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
