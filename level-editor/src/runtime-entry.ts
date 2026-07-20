import * as PIXI from 'pixi.js';
import { mountRuntime } from '../../src/browser/bootstrap';
import { loadCommandModifiers } from '../../src/browser/commandModifiers';

function ensureSlashEnd(s: string): string { return s.endsWith('/') ? s : (s + '/'); }

async function main() {
  // Build base from ?base=, default to /00project/
  const params = new URLSearchParams(location.search);
  const here = location.pathname.replace(/[^\/]*$/, '');
  let base = params.get('base') || '';
  // Default: current HTML directory + '00project/' when base is missing
  if (!base || !base.trim()) base = here + '00project/';
  // If provided and is relative, resolve against current directory
  if (!/^([a-zA-Z][a-zA-Z0-9+.-]*:|\/)/.test(base)) {
    base = here + base.replace(/^\.\//,'');
  }
  base = ensureSlashEnd(base);
  // Expose base for runtime helpers that rely on __ASSET_BASE__/__PROJECT_BASE__
  (window as any).__ASSET_BASE__ = base;
  (window as any).__PROJECT_BASE__ = base;
  try { await loadCommandModifiers(base); } catch {}

  const appEl = document.getElementById('app') as HTMLElement;
  if (!appEl) throw new Error('#app not found');

  // Fetch game JSON
  const gameUrl = base + 'scene/login.json';
  let currentSceneUrl = gameUrl;
  const res = await fetch(gameUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${gameUrl}: HTTP ${res.status}`);
  let game: any = await res.json();
  try { (window as any).__GAME_JSON_URL = currentSceneUrl; } catch {}
  try { if (game && typeof game === 'object') (game as any).__runtimeSceneUrl = currentSceneUrl; } catch {}

  // Inject skins and normalize resource URLs to absolute
  try {
    try {
      const cfgRes = await fetch(base + 'config.json', { cache: 'no-cache' });
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        const skins = (cfg && (cfg.skins || (cfg.resources && cfg.resources.skins))) || [];
        if (Array.isArray(skins) && skins.length) game.skins = skins;
      }
    } catch {}
    const ensureAbs = (u?: string) => {
      if (!u) return u as any;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) || u.startsWith('/') || u.startsWith('../')) return u;
      const clean = String(u).replace(/^\.\//,'').replace(/^\/+/, '');
      return base + clean;
    };
    const normArr = (arr?: Array<{ url?: string; src?: string }>) => {
      if (Array.isArray(arr)) arr.forEach(r => { if (r && (r.url || r.src)) (r as any).url = ensureAbs(r.url || r.src); });
    };
    if (Array.isArray(game.resources)) game.resources.forEach((r: any) => { if (r && (r.url || r.src)) r.url = ensureAbs(r.url || r.src); });
    else if (game.resources && typeof game.resources === 'object') {
      normArr(game.resources.images); normArr(game.resources.animations); normArr(game.resources.audios); normArr(game.resources.videos);
    }
    if (Array.isArray(game.skins)) game.skins.forEach((s: any) => { if (s && s.url) s.url = ensureAbs(s.url); });
    (window as any).__VFS_GET_URL__ = async (rel: string) => { const clean = String(rel||'').replace(/^\.\//,'').replace(/^\/+/, ''); return base + clean; };
  } catch {}

  // Size and mount
  const w = (game?.levels?.[0]?.canvasWidth) || 800;
  const h = (game?.levels?.[0]?.canvasHeight) || 600;
  appEl.style.width = w + 'px'; appEl.style.height = h + 'px';
  let mounted = await mountRuntime(appEl, game, { width: w, height: h, pixi: PIXI });

  // Fit to window
  const fit = () => {
    try {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const s = Math.max(0.1, Math.min(vw / w, vh / h));
      mounted.setViewScale?.(s);
      // Resize container to the scaled size to avoid clipping or scrollbars
      appEl.style.width = Math.round(w * s) + 'px';
      appEl.style.height = Math.round(h * s) + 'px';
    } catch {}
  };
  window.addEventListener('resize', fit);
  // Run twice to account for initial layout/scrollbar changes
  fit();
  requestAnimationFrame(fit);

  // Scene redirect support (NEXT_LEVEL and SCENE_REDIRECT rely on this when present)
  const loadFrom = async (urlOrData: any) => {
    try {
      let data: any = urlOrData;
      let targetIndex: number | undefined = undefined;
      let nextSceneUrl: string = currentSceneUrl;
      const ensureSlashEnd = (s: string) => s.endsWith('/') ? s : (s + '/');
      const resolveAbs = (u?: string) => {
        if (!u) return u as any;
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) || u.startsWith('/') || u.startsWith('../')) return u;
        const clean = String(u).replace(/^\.\//,'').replace(/^\/+/, '');
        return base + clean;
      };
      if (typeof urlOrData === 'string') {
        const token = urlOrData.trim();
        if (token.toLowerCase() === 'this') {
          // reload current
          data = game;
        } else {
          const abs = resolveAbs(token);
          const r = await fetch(abs, { cache: 'no-cache' });
          data = await r.json();
          nextSceneUrl = abs;
        }
      } else if (urlOrData && typeof urlOrData === 'object') {
        const obj: any = urlOrData;
        // reload current scene, optionally keep currentLevelId
        if (obj.reload === true) {
          data = game;
          const id = obj.currentLevelId;
          if (id && data && Array.isArray(data.levels)) {
            const idx = data.levels.findIndex((lv: any) => lv?.id === id);
            if (idx >= 0) targetIndex = idx;
          }
          nextSceneUrl = currentSceneUrl;
        } else if (Array.isArray(obj.levels)) {
          // whole scene object
          data = obj;
          if (typeof obj.levelIndex === 'number') targetIndex = Number(obj.levelIndex);
          else if (typeof obj.__currentOriginalIndex === 'number') targetIndex = Number(obj.__currentOriginalIndex);
          if (typeof (obj as any).__runtimeSceneUrl === 'string') nextSceneUrl = String((obj as any).__runtimeSceneUrl);
        } else if (obj.data || obj.url) {
          if (obj.data) data = obj.data;
          if (typeof obj.levelIndex === 'number') targetIndex = Number(obj.levelIndex);
          if (obj.url) {
            if (typeof obj.url === 'string') {
              const abs = resolveAbs(obj.url);
              const r = await fetch(abs, { cache: 'no-cache' });
              data = await r.json();
              nextSceneUrl = abs;
            } else if (typeof obj.url === 'object') {
              // Support handoff where scene object is passed via { url: <object> }
              data = obj.url;
              if (typeof (data as any)?.levelIndex === 'number' && typeof targetIndex === 'undefined') {
                targetIndex = Number((data as any).levelIndex);
              } else if (typeof (data as any)?.__currentOriginalIndex === 'number' && typeof targetIndex === 'undefined') {
                targetIndex = Number((data as any).__currentOriginalIndex);
              }
              if (typeof (data as any)?.__runtimeSceneUrl === 'string') nextSceneUrl = String((data as any).__runtimeSceneUrl);
            }
          }
        } else {
          // Unrecognized payload → fallback: keep current scene
          data = game;
          nextSceneUrl = currentSceneUrl;
        }
      }
      if (data && typeof data === 'object' && typeof (data as any).__runtimeSceneUrl === 'string') {
        nextSceneUrl = String((data as any).__runtimeSceneUrl);
      }
      // Inject skins and normalize resource URLs
      try {
        const cfgRes = await fetch(base + 'config.json', { cache: 'no-cache' });
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          const skins = (cfg && (cfg.skins || (cfg.resources && cfg.resources.skins))) || [];
          if (Array.isArray(skins) && skins.length) data.skins = skins;
        }
      } catch {}
      const ensureAbsRes = (u?: string) => resolveAbs(u);
      const normArr2 = (arr?: Array<{ url?: string; src?: string }>) => {
        if (Array.isArray(arr)) arr.forEach(r => { if (r && (r.url || r.src)) (r as any).url = ensureAbsRes(r.url || r.src); });
      };
      if (Array.isArray(data.resources)) data.resources.forEach((r: any) => { if (r && (r.url || r.src)) r.url = ensureAbsRes(r.url || r.src); });
      else if (data.resources && typeof data.resources === 'object') {
        normArr2(data.resources.images); normArr2(data.resources.animations); normArr2(data.resources.audios); normArr2(data.resources.videos);
      }
      if (Array.isArray(data.skins)) data.skins.forEach((s: any) => { if (s && s.url) s.url = ensureAbsRes(s.url); });
      (window as any).__VFS_GET_URL__ = async (rel: string) => { const clean = String(rel||'').replace(/^\.\//,'').replace(/^\/+/, ''); return base + clean; };

      // Remount
      try { mounted.dispose(); } catch {}
      appEl.innerHTML = '';
      const W = (data?.levels?.[0]?.canvasWidth) || w;
      const H = (data?.levels?.[0]?.canvasHeight) || h;
      appEl.style.width = W + 'px'; appEl.style.height = H + 'px';
      try { (window as any).__GAME_JSON_URL = nextSceneUrl; } catch {}
      if (data && typeof data === 'object') {
        try { (data as any).__runtimeSceneUrl = nextSceneUrl; } catch {}
      }
      currentSceneUrl = nextSceneUrl;
      mounted = await mountRuntime(appEl, data, { width: W, height: H, pixi: PIXI, startLevelIndex: targetIndex });
      fit();
      game = data;
    } catch (e) { console.warn('[runtime-entry] redirect failed', e); }
  };
  (window as any).__PIXICANVAS_REDIRECT__ = loadFrom;
  window.addEventListener('message', (ev) => {
    try { const m = ev?.data; if (m && m.type === 'LOAD_GAME_JSON' && m.payload) loadFrom(m.payload); } catch {}
  });
}

document.addEventListener('DOMContentLoaded', () => { main().catch(err => { console.error('[runtime-entry] failed', err); alert('加载失败: ' + (err?.message || String(err))); }); });
