import { GameProject } from '../types';

export type VarType = 'number'|'boolean'|'string';
export type VarMode = 'temp'|'global'|'mixed';

export interface VarMetaResult {
  types: Map<string, VarType>;
  modes: Map<string, VarMode>;
}

export function scanVarMeta(project: GameProject | null | undefined): VarMetaResult {
  const types = new Map<string, VarType>();
  const modes = new Map<string, VarMode>();
  if (!project || !Array.isArray(project.levels)) return { types, modes };

  const setType = (k: string, t: VarType) => { if (!k) return; types.set(k, t); };
  const markMode = (k: string, desired: 'temp'|'global') => {
    if (!k) return;
    const prev = modes.get(k);
    if (!prev) { modes.set(k, desired); return; }
    if (prev !== desired) modes.set(k, 'mixed');
  };

  const visitList = (list: any[]) => {
    for (const node of list || []) {
      if (!node || typeof node !== 'object') continue;
      const t = String(node.type || '').toUpperCase();
      const p = (node.parameters || {}) as any;
      if (t === 'SET_VARIABLE' && p && p.key) {
        const op = String(p.op || 'set').toLowerCase();
        if (op === 'add' || op === 'sub' || op === 'mul' || op === 'div') setType(p.key, 'number');
        else if (typeof p.value === 'number') setType(p.key, 'number');
        else if (typeof p.value === 'boolean') setType(p.key, 'boolean');
        else setType(p.key, 'string');
        markMode(p.key, p.temporary === true ? 'temp' : 'global');
      }
      if (t === 'SET_SWITCH' && p && p.key) {
        setType(p.key, 'boolean');
        markMode(p.key, p.temporary === true ? 'temp' : 'global');
      }
      if (t === 'SET_SELECTABLE' && p && p.variableKey) {
        setType(p.variableKey, 'boolean');
      }
      const nested: any[][] = [];
      if (Array.isArray(p.commands)) nested.push(p.commands);
      if (Array.isArray(p.trueCommands)) nested.push(p.trueCommands);
      if (Array.isArray(p.falseCommands)) nested.push(p.falseCommands);
      if (Array.isArray((node as any).children)) nested.push((node as any).children);
      nested.forEach(visitList);
    }
  };

  for (const lv of project.levels) {
    const root = Array.isArray((lv as any).rawCommands) ? (lv as any).rawCommands : (Array.isArray((lv as any).commands) ? (lv as any).commands : []);
    visitList(root);
    const evs = (lv as any).events || [];
    for (const ev of evs) visitList(ev?.commands || []);
  }

  // Explicit globals bias to global mode if not mixed already
  const gv = (project.globalVariables || {}) as any;
  for (const k of Object.keys(gv)) { markMode(k, 'global'); }

  return { types, modes };
}

