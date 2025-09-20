// A tiny virtual project store over localStorage to unify scene lists
// across server projects and local-folder projects.

export type ProjectKey = string; // '' or '/default-project/' etc., we normalize to 'local' for ''

export interface SceneMeta {
  path: string; // scene/xxx.json
  lastEditedAt?: number;
}

const LS_KEY = 'editor:projects';
const CUR_KEY = 'editor:projects:currentKey';

function loadAll(): Record<string, SceneMeta[]> {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function saveAll(map: Record<string, SceneMeta[]>): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
}
function normKey(base: string | undefined | null): string { return (base && base.trim()) ? base : 'local'; }

export function setCurrentProjectKey(base: string): void {
  try { localStorage.setItem(CUR_KEY, normKey(base)); } catch {}
}
export function getCurrentProjectKey(): string | null {
  try { return localStorage.getItem(CUR_KEY); } catch { return null; }
}

export function listScenes(base: string): SceneMeta[] {
  const key = normKey(base);
  const all = loadAll();
  return Array.isArray(all[key]) ? all[key] : [];
}

export function setScenes(base: string, scenes: SceneMeta[]): void {
  const key = normKey(base);
  const all = loadAll();
  all[key] = dedupNormalize(scenes);
  saveAll(all);
}

export function upsertScene(base: string, meta: SceneMeta): void {
  const key = normKey(base);
  const all = loadAll();
  const arr: SceneMeta[] = Array.isArray(all[key]) ? all[key] : [];
  const idx = arr.findIndex(s => s.path === meta.path);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...meta }; else arr.push(meta);
  all[key] = dedupNormalize(arr);
  saveAll(all);
}

export function removeScene(base: string, path: string): void {
  const key = normKey(base);
  const all = loadAll();
  const arr: SceneMeta[] = Array.isArray(all[key]) ? all[key] : [];
  all[key] = arr.filter(s => s.path !== path);
  saveAll(all);
}

function dedupNormalize(arr: SceneMeta[]): SceneMeta[] {
  const seen = new Set<string>();
  const out: SceneMeta[] = [];
  for (const s of arr) {
    if (!s || typeof s !== 'object' || !s.path) continue;
    const p = s.path.replace(/^\.\//,'');
    const norm = p.startsWith('scene/') ? p : ('scene/' + p);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ path: norm, lastEditedAt: s.lastEditedAt });
  }
  return out;
}

