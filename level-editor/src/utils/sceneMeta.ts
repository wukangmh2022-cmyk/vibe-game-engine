function ensureTrailingSlash(base?: string | null): string {
  if (!base) return '';
  const trimmed = String(base);
  if (!trimmed.trim()) return '';
  return trimmed.endsWith('/') ? trimmed : (trimmed + '/');
}

function isAbsolutePath(p: string): boolean {
  return /^([a-zA-Z][a-zA-Z0-9+.-]*:|\/|blob:|data:)/.test(p);
}

/**
 * Attach __runtimeSceneUrl metadata onto a game JSON so downstream runtime helpers
 * (e.g. getSceneId/getSceneName) can derive the original file name.
 */
export function attachRuntimeSceneUrl(
  gameData: any,
  opts: { base?: string | null; scenePath?: string | null; source?: string | null } = {}
): void {
  if (!gameData || typeof gameData !== 'object') return;
  const base = ensureTrailingSlash(opts.base);
  const scenePathRaw = opts.scenePath && String(opts.scenePath).trim() ? String(opts.scenePath).trim() : '';
  let resolved: string | undefined;

  if (scenePathRaw) {
    if (isAbsolutePath(scenePathRaw)) {
      resolved = scenePathRaw;
    } else {
      let rel = scenePathRaw.replace(/^\.\//,'').replace(/^\/+/, '');
      if (!rel.startsWith('scene/')) rel = `scene/${rel}`;
      resolved = base ? `${base}${rel}` : rel;
    }
  }

  if (!resolved && opts.source && String(opts.source).trim()) {
    resolved = String(opts.source).trim();
  }

  if (resolved) {
    try { (gameData as any).__runtimeSceneUrl = resolved; } catch {}
  }
}
