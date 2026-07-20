import { buildModifierMap, CommandModifierConfig, setGlobalCommandModifiers } from '../core/commandModifiers';

const ensureSlashEnd = (base?: string | null): string | null => {
  if (!base) return null;
  const trimmed = String(base);
  if (!trimmed.trim()) return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

let cachedBase: string | null = null;
let cachedModifiers: CommandModifierConfig | null = null;

export async function loadCommandModifiers(base?: string | null): Promise<CommandModifierConfig | null> {
  const resolved = ensureSlashEnd(base || guessBase());
  if (!resolved) {
    cachedBase = null;
    cachedModifiers = null;
    setGlobalCommandModifiers(null);
    return null;
  }
  if (cachedModifiers && cachedBase === resolved) {
    setGlobalCommandModifiers(cachedModifiers);
    return cachedModifiers;
  }
  const url = resolved + 'modify.json';
  try {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) {
      cachedBase = resolved;
      cachedModifiers = null;
      setGlobalCommandModifiers(null);
      return null;
    }
    const raw = await resp.json();
    const normalized = buildModifierMap(raw);
    cachedBase = resolved;
    cachedModifiers = normalized;
    setGlobalCommandModifiers(normalized);
    return normalized;
  } catch {
    cachedBase = resolved;
    cachedModifiers = null;
    setGlobalCommandModifiers(null);
    return null;
  }
}

const guessBase = (): string | null => {
  try {
    const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
    const cand = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__;
    return typeof cand === 'string' ? cand : null;
  } catch {
    return null;
  }
};
