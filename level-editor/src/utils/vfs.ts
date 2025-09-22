// Minimal Virtual File System (VFS) for the editor
// Backends:
// - folder: Map<string, File> provided by user-selected local folder
// - idb: IndexedDB persistent store for scenes/resources (no network after import)

export type VFSBackendName = 'folder' | 'idb';
export type FileType = 'file' | 'directory';
export interface VFile {
  name: string;
  path: string; // relative path without leading '/'
  type: FileType;
  size?: number;
  lastModified?: number | null;
}

type FileEntry = {
  path: string;
  mime: string;
  mtime: number;
  // For idb backend, content is persisted in IndexedDB (string for JSON, Blob for binary)
  // For folder backend, content is not stored here; we read via Map<string, File>
};

type IFolderOptions = {
  files: Map<string, File>;
};

function isAbs(p: string): boolean {
  return /^(https?:|blob:|data:|file:)/.test(p) || p.startsWith('/') || p.startsWith('../');
}

function normPath(p: string): string {
  const s = String(p || '').replace(/^\.\//, '').replace(/^\/+/, '');
  return s;
}
function normDir(p: string): string { return normPath(p).replace(/\/$/, ''); }
function joinPath(a: string, b: string): string { return (a ? (a.replace(/\/$/, '') + '/') : '') + normPath(b); }
function baseName(p: string): string { const s = normPath(p); const i = s.lastIndexOf('/'); return i >= 0 ? s.slice(i+1) : s; }
function dirName(p: string): string { const s = normPath(p); const i = s.lastIndexOf('/'); return i >= 0 ? s.slice(0, i) : ''; }

function ensureScenePath(p: string): string {
  const s = normPath(p);
  return s.startsWith('scene/') ? s : `scene/${s}`;
}

// Simple IndexedDB helper
const DB_NAME = 'editor-vfs';
const STORE = 'files';

async function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'path' });
        os.createIndex('by_path', 'path', { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(rec: any): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const os = tx.objectStore(STORE);
    os.put(rec);
  });
}

async function idbGet(path: string): Promise<any | undefined> {
  const db = await idbOpen();
  return await new Promise<any | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    tx.onerror = () => reject(tx.error);
    const os = tx.objectStore(STORE);
    const req = os.get(path);
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(path: string): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const os = tx.objectStore(STORE);
    os.delete(path);
  });
}

async function idbAllKeys(): Promise<string[]> {
  const db = await idbOpen();
  return await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    tx.onerror = () => reject(tx.error);
    const os = tx.objectStore(STORE);
    const req = os.getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(k => String(k)));
    req.onerror = () => reject(req.error);
  });
}

// In-memory cache for resource blob URLs (for sync resolver usage)
const resourceURLCache = new Map<string, string>(); // path -> blobURL

function cacheBlobURL(path: string, blob: Blob): string {
  try {
    const old = resourceURLCache.get(path);
    if (old && old.startsWith('blob:')) {
      try { URL.revokeObjectURL(old); } catch {}
    }
  } catch {}
  const url = URL.createObjectURL(blob);
  resourceURLCache.set(path, url);
  return url;
}

// Current backend state
let backend: VFSBackendName = 'idb';
let folderFiles: Map<string, File> | null = null;
let currentBase = '/default-project/';
let fsaDirHandle: any = null; // optional File System Access directory handle

export interface IVFS {
  // backend/project base
  setBackend(name: VFSBackendName, options?: Partial<IFolderOptions>): void;
  setProjectBase(base: string): void;
  getBackend(): VFSBackendName;
  getBase(): string;
  setFsDirectoryHandle?(handle: any): void;

  // filesystem-like
  readdir(dir?: string): Promise<VFile[]>;
  exists(p: string): Promise<{ exists: boolean; type?: FileType }>;
  mkdir(dir: string, opts?: { recursive?: boolean }): Promise<void>;
  unlink(p: string, opts?: { recursive?: boolean }): Promise<void>;
  isWritable(): Promise<boolean>;
  readFile(path: string): Promise<string | Blob | null>;
  readText(path: string): Promise<string | null>;
  readJSON<T = any>(path: string): Promise<T | null>;
  writeFile(path: string, content: string | Blob, mime?: string): Promise<void>;
  writeText(path: string, text: string, mime?: string): Promise<void>;
  writeJSON(path: string, data: any): Promise<void>;
  newFile(path: string, content: string | Blob, mime?: string): Promise<void>;
  delete(path: string): Promise<void>;
  rename(src: string, dst: string): Promise<void>;
  copyFile(src: string, dst: string): Promise<void>;
  getURL(path: string): Promise<string | undefined>;

  // scene helpers
  listSceneMetas(): Promise<Array<{ path: string; mtime: number | null }>>;
  listScenes(): Promise<string[]>;
  readScene(path: string): Promise<any | null>;
  writeScene(path: string, data: any): Promise<void>;
  deleteScene(path: string): Promise<void>;
  renameScene(oldPath: string, newPath: string): Promise<void>;

  // resources + import
  getResourceURL(resourcePath: string): string | undefined;
  importFromServer(baseUrl: string): Promise<{ scenes: string[] }>;
  rewriteResourceURLs(gameData: any): void;
}

export const vfs: IVFS = {
  setBackend(name: VFSBackendName, options?: Partial<IFolderOptions>) {
    backend = name;
    if (name === 'folder') {
      folderFiles = (options?.files as any) || null;
    } else {
      folderFiles = null;
    }
  },
  setProjectBase(base: string) {
    currentBase = (base && base.trim()) ? (base.endsWith('/') ? base : base + '/') : '';
  },
  getBackend(): VFSBackendName { return backend; },
  getBase(): string { return currentBase; },
  setFsDirectoryHandle(handle: any) { try { fsaDirHandle = handle || null; } catch { fsaDirHandle = null; } },

  // Scenes
  async listSceneMetas(): Promise<Array<{ path: string; mtime: number | null }>> {
    if (backend === 'folder' && folderFiles) {
      // Enumerate scene/*.json
      const list: Array<{ path: string; mtime: number | null }> = [];
      for (const k of folderFiles.keys()) {
        if (k.startsWith('scene/') && k.endsWith('.json')) {
          const f = folderFiles.get(k)!;
          list.push({ path: ensureScenePath(k), mtime: f ? (f.lastModified || null) : null });
        }
      }
      list.sort((a,b)=> (a.path<b.path?-1: a.path>b.path?1:0));
      return list;
    }
    // idb
    try {
      const keys = await idbAllKeys();
      const metas: Array<{ path: string; mtime: number | null }> = [];
      for (const k of keys) {
        if (k.startsWith('scene/') && k.endsWith('.json')) {
          const rec = await idbGet(k);
          metas.push({ path: ensureScenePath(k), mtime: rec ? (rec.mtime || null) : null });
        }
      }
      metas.sort((a,b)=> (a.path<b.path?-1: a.path>b.path?1:0));
      return metas;
    } catch { return []; }
  },

  async listScenes(): Promise<string[]> {
    const metas = await this.listSceneMetas();
    return metas.map(m => m.path);
  },

  // Generic directory traversal (filesystem-like)
  async readdir(dir: string = ''): Promise<VFile[]> {
    const d = normDir(dir);
    const prefix = d ? d + '/' : '';
    const childs = new Map<string, VFile>();
    if (backend === 'folder' && folderFiles) {
      for (const k of folderFiles.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (!rest) continue;
        const slash = rest.indexOf('/');
        if (slash >= 0) {
          const name = rest.slice(0, slash);
          if (!childs.has(name)) childs.set(name, { name, path: joinPath(d, name), type: 'directory' });
        } else {
          const f = folderFiles.get(k)!;
          const name = rest;
          childs.set(name, { name, path: joinPath(d, name), type: 'file', size: f.size, lastModified: f.lastModified || null });
        }
      }
      return Array.from(childs.values()).sort((a,b)=> a.name.localeCompare(b.name));
    }
    // idb
    const keys = await idbAllKeys();
    for (const k of keys) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf('/');
      if (slash >= 0) {
        const name = rest.slice(0, slash);
        if (!childs.has(name)) childs.set(name, { name, path: joinPath(d, name), type: 'directory' });
      } else {
        const name = rest;
        const rec = await idbGet(k);
        const size = rec ? (rec.content instanceof Blob ? rec.content.size : (typeof rec.content === 'string' ? new TextEncoder().encode(rec.content).length : 0)) : undefined;
        childs.set(name, { name, path: joinPath(d, name), type: 'file', size, lastModified: rec ? (rec.mtime || null) : null });
      }
    }
    return Array.from(childs.values()).sort((a,b)=> a.name.localeCompare(b.name));
  },

  async exists(p: string): Promise<{ exists: boolean; type?: FileType }> {
    const path = normPath(p);
    if (!path) {
      // root
      return { exists: true, type: 'directory' };
    }
    if (backend === 'folder' && folderFiles) {
      if (folderFiles.has(path)) return { exists: true, type: 'file' };
      const pre = path + '/';
      for (const k of folderFiles.keys()) if (k.startsWith(pre)) return { exists: true, type: 'directory' };
      return { exists: false };
    }
    const rec = await idbGet(path);
    if (rec) return { exists: true, type: 'file' };
    const pre = path + '/';
    const keys = await idbAllKeys();
    if (keys.some(k => k.startsWith(pre))) return { exists: true, type: 'directory' };
    return { exists: false };
  },

  async mkdir(dir: string, _opts: { recursive?: boolean } = { recursive: true }): Promise<void> {
    // Directories are virtual; ensure no-op success.
    return;
  },

  async unlink(p: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const path = normPath(p);
    const info = await this.exists(path);
    if (!info.exists) return;
    if (info.type === 'file') {
      if (backend === 'folder' && folderFiles) { folderFiles.delete(path); return; }
      await idbDelete(path); return;
    }
    // directory
    if (!opts.recursive) throw new Error('EISDIR: directory not empty (use recursive:true)');
    if (backend === 'folder' && folderFiles) {
      const pre = path ? path + '/' : '';
      const keys = Array.from(folderFiles.keys());
      keys.forEach(k => { if (k.startsWith(pre)) folderFiles!.delete(k); });
      return;
    }
    const pre = path ? path + '/' : '';
    const keys = await idbAllKeys();
    for (const k of keys) if (k.startsWith(pre)) await idbDelete(k);
  },

  async isWritable(): Promise<boolean> { return true; },

  async readScene(path: string): Promise<any | null> {
    const p = ensureScenePath(path);
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(p) || folderFiles.get(normPath(p));
      if (!f) return null;
      const text = await f.text();
      return JSON.parse(text);
    }
    const rec = await idbGet(p);
    if (!rec) return null;
    try { return typeof rec.content === 'string' ? JSON.parse(rec.content) : null; } catch { return null; }
  },

  async writeScene(path: string, data: any): Promise<void> {
    const p = ensureScenePath(path);
    const text = JSON.stringify(data, null, 2);
    const now = Date.now();
    if (backend === 'folder' && folderFiles) {
      try {
        const blob = new Blob([text], { type: 'application/json' });
        const file = new File([blob], p.split('/').pop() || 'scene.json', { type: 'application/json' } as any);
        folderFiles.set(p, file);
        if (fsaDirHandle) { try { await fsaWriteFile(fsaDirHandle, p, blob); } catch {} }
      } catch {}
      return;
    }
    await idbPut({ path: p, mime: 'application/json', mtime: now, content: text });
  },

  async deleteScene(path: string): Promise<void> {
    const p = ensureScenePath(path);
    if (backend === 'folder' && folderFiles) {
      folderFiles.delete(p);
      if (fsaDirHandle) { try { await fsaRemoveEntry(fsaDirHandle, p); } catch {} }
      return;
    }
    await idbDelete(p);
  },

  async renameScene(oldPath: string, newPath: string): Promise<void> {
    const src = ensureScenePath(oldPath);
    const dst = ensureScenePath(newPath);
    if (src === dst) return;
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(src);
      if (f) {
        folderFiles.delete(src);
        try {
          const text = await f.text();
          const blob = new Blob([text], { type: 'application/json' });
          const file = new File([blob], dst.split('/').pop() || 'scene.json', { type: 'application/json' } as any);
          folderFiles.set(dst, file);
          if (fsaDirHandle) { try { await fsaWriteFile(fsaDirHandle, dst, blob); await fsaRemoveEntry(fsaDirHandle, src); } catch {} }
        } catch {}
      }
      return;
    }
    const rec = await idbGet(src);
    if (rec) {
      await idbPut({ ...rec, path: dst });
      await idbDelete(src);
    }
  },

  // Resources
  getResourceURL(resourcePath: string): string | undefined {
    // Accept id/path; only path resolution here
    const p = normPath(resourcePath);
    // In-memory cached URL
    const cached = resourceURLCache.get(p);
    if (cached) return cached;
    // Folder: can create blob URL synchronously
    if (backend === 'folder' && folderFiles) {
      const file = folderFiles.get(p) || folderFiles.get(p.replace(/^\/+/, ''));
      if (file) {
        return cacheBlobURL(p, file);
      }
      return undefined;
    }
    // For idb backend, try to serve from cache or lazily build from stored content
    const recPromise = idbGet(p).catch(() => undefined);
    // Not awaited to keep API sync; consuming code can prefer async getURL
    // Here we only return cached URL if any; otherwise undefined.
    return resourceURLCache.get(p);
  },

  // Import a remote project into IDB VFS (scenes + resources)
  async importFromServer(baseUrl: string): Promise<{ scenes: string[] }> {
    const base = (baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    this.setBackend('idb');
    this.setProjectBase(base);

    // Fetch config.json
    const cfgRes = await fetch(base + 'config.json');
    if (!cfgRes.ok) throw new Error(`加载失败: ${base}config.json`);
    const cfgText = await cfgRes.text();
    await idbPut({ path: 'config.json', mime: 'application/json', mtime: Date.now(), content: cfgText });
    let scenePaths: string[] = [];
    try {
      const cfg = JSON.parse(cfgText);
      const root = cfg?.['scene-tree']?.curnode; if (root) scenePaths.push(normPath(root));
      const children = Array.isArray(cfg?.['scene-tree']?.child_node) ? cfg['scene-tree'].child_node : [];
      children.forEach((c: any) => { if (c?.curnode) scenePaths.push(normPath(c.curnode)); });
    } catch {}
    scenePaths = scenePaths.map(ensureScenePath);
    if (!scenePaths.length) scenePaths = ['scene/hello-world.json'];

    // Fetch scenes
    const seenRes = new Set<string>();
    for (const p of scenePaths) {
      const url = base + normPath(p);
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      await idbPut({ path: p, mime: 'application/json', mtime: Date.now(), content: text });
      // Collect resources
      try {
        const json = JSON.parse(text);
        const resObj = json?.resources || {};
        const collect = (arr: any[]) => { arr.forEach((r: any) => { const src: string = r?.src || r?.url; if (typeof src === 'string') seenRes.add(normPath(src)); }); };
        if (Array.isArray(resObj.images)) collect(resObj.images);
        if (Array.isArray(resObj.audios)) collect(resObj.audios);
        if (Array.isArray(resObj.animations)) collect(resObj.animations);
        if (Array.isArray(resObj.videos)) collect(resObj.videos);
      } catch {}
    }

    // Try to fetch and cache resources (best-effort)
    for (const rp of Array.from(seenRes)) {
      try {
        const url = isAbs(rp) ? rp : (base + rp);
        const r = await fetch(url);
        if (!r.ok) continue;
        const blob = await r.blob();
        await idbPut({ path: rp, mime: blob.type || 'application/octet-stream', mtime: Date.now(), content: blob });
        cacheBlobURL(rp, blob);
      } catch {}
    }

    return { scenes: scenePaths };
  },

  // Helper: rewrite resources inside a gameData JSON to blob URLs if available
  rewriteResourceURLs(gameData: any) {
    try {
      const groups = ['images','audios','animations','videos'];
      const res = (gameData && typeof gameData === 'object') ? (gameData.resources || {}) : {};
      for (const g of groups) {
        const arr = Array.isArray(res[g]) ? res[g] : [];
        for (const item of arr) {
          const src: string = item?.src || item?.url;
          if (typeof src === 'string') {
            const p = normPath(src);
            const u = this.getResourceURL(p);
            if (u) item.src = u;
          }
        }
      }
      // also rewrite project-level skins (array form)
      try {
        const skins = Array.isArray((gameData as any)?.skins) ? (gameData as any).skins : [];
        for (const s of skins) {
          const url = s?.url;
          if (typeof url === 'string') {
            const p = normPath(url);
            const u = this.getResourceURL(p);
            if (u) s.url = u;
          }
        }
      } catch {}
    } catch {}
  },

  // --- generic FS-like helpers on vfs (duplicate of fs alias for convenience) ---
  async readFile(path: string): Promise<string | Blob | null> {
    const p = normPath(path);
    if (backend === 'folder' && folderFiles) {
      const file = folderFiles.get(p) || folderFiles.get(p.replace(/^\/+/, ''));
      if (!file) return null;
      if (/\.(json|txt|csv|md|js|ts|css|html)$/i.test(p)) return await file.text();
      return file;
    }
    const rec = await idbGet(p);
    if (!rec) return null;
    const c = rec.content;
    if (c instanceof Blob) return c as Blob;
    return String(c ?? '');
  },
  async readText(path: string): Promise<string | null> {
    const v = await this.readFile(path);
    if (v == null) return null;
    if (v instanceof Blob) return await v.text();
    return String(v);
  },
  async readJSON<T = any>(path: string): Promise<T | null> {
    const txt = await this.readText(path);
    if (txt == null) return null;
    try { return JSON.parse(txt) as T; } catch { return null; }
  },
  async writeFile(path: string, content: string | Blob, mime?: string): Promise<void> {
    const p = normPath(path);
    const now = Date.now();
    if (backend === 'folder' && folderFiles) {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
      const file = new File([blob], p.split('/').pop() || 'file', { type: blob.type, lastModified: now } as any);
      folderFiles.set(p, file);
      if (fsaDirHandle) { try { await fsaWriteFile(fsaDirHandle, p, blob); } catch {} }
      return;
    }
    if (content instanceof Blob) {
      await idbPut({ path: p, mime: mime || content.type || 'application/octet-stream', mtime: now, content });
      try { cacheBlobURL(p, content); } catch {}
    } else {
      await idbPut({ path: p, mime: mime || 'text/plain', mtime: now, content });
    }
  },
  async writeText(path: string, text: string, mime = 'text/plain'): Promise<void> { await this.writeFile(path, text, mime); },
  async writeJSON(path: string, data: any): Promise<void> { await this.writeFile(path, JSON.stringify(data, null, 2), 'application/json'); },
  async newFile(path: string, content: string | Blob, mime?: string): Promise<void> { await this.writeFile(path, content, mime); },
  async delete(path: string): Promise<void> { await this.unlink(path, { recursive: false }); },
  async rename(src: string, dst: string): Promise<void> {
    const s = normPath(src); const d = normPath(dst);
    if (s === d) return;
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(s);
      if (f) { folderFiles.delete(s); folderFiles.set(d, f); }
      return;
    }
    const rec = await idbGet(s);
    if (rec) { await idbPut({ ...rec, path: d }); await idbDelete(s); }
  },
  async copyFile(src: string, dst: string): Promise<void> {
    const s = normPath(src); const d = normPath(dst);
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(s);
      if (f) {
        const blob = new Blob([await f.arrayBuffer()], { type: f.type });
        const file = new File([blob], d.split('/').pop() || 'file', { type: f.type, lastModified: Date.now() } as any);
        folderFiles.set(d, file);
      }
      return;
    }
    const rec = await idbGet(s);
    if (rec) { await idbPut({ ...rec, path: d }); }
  },
  async getURL(path: string): Promise<string | undefined> {
    const p = normPath(path);
    const cached = resourceURLCache.get(p); if (cached) return cached;
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(p) || folderFiles.get(p.replace(/^\/+/, ''));
      if (f) return cacheBlobURL(p, f);
      return undefined;
    }
    const rec = await idbGet(p);
    if (!rec) return undefined;
    const c = rec.content;
    if (c instanceof Blob) return cacheBlobURL(p, c);
    const blob = new Blob([String(c ?? '')], { type: rec.mime || 'text/plain' });
    return cacheBlobURL(p, blob);
  }
};

export default vfs;

// File System Access helpers (best-effort)
async function fsaGetParentAndName(dirHandle: any, relPath: string): Promise<{ parent: any; name: string }> {
  const parts = normPath(relPath).split('/').filter(Boolean);
  const name = parts.pop() || '';
  let cur = dirHandle;
  for (const seg of parts) {
    cur = await cur.getDirectoryHandle(seg, { create: true });
  }
  return { parent: cur, name };
}

async function fsaWriteFile(dirHandle: any, relPath: string, content: Blob | string): Promise<void> {
  try {
    const { parent, name } = await fsaGetParentAndName(dirHandle, relPath);
    const fh = await parent.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    if (content instanceof Blob) await w.write(content); else await w.write(new Blob([content]));
    await w.close();
  } catch {}
}

async function fsaRemoveEntry(dirHandle: any, relPath: string): Promise<void> {
  try {
    const parts = normPath(relPath).split('/').filter(Boolean);
    const name = parts.pop() || '';
    let cur = dirHandle;
    for (const seg of parts) cur = await cur.getDirectoryHandle(seg, { create: false });
    await cur.removeEntry(name);
  } catch {}
}

// Convenience, filesystem-like aliases
export const fs = {
  setBackend: vfs.setBackend.bind(vfs),
  setProjectBase: vfs.setProjectBase.bind(vfs),
  getBackend: vfs.getBackend.bind(vfs),
  getBase: vfs.getBase.bind(vfs),

  // Generic file operations (work for both scenes and resources)
  async readFile(path: string): Promise<string | Blob | null> {
    const p = normPath(path);
    if (backend === 'folder' && folderFiles) {
      const file = folderFiles.get(p) || folderFiles.get(p.replace(/^\/+/, ''));
      if (!file) return null;
      // Heuristic: JSON/text extensions → return text
      if (/\.(json|txt|csv|md|js|ts|css|html)$/i.test(p)) return await file.text();
      return file;
    }
    const rec = await idbGet(p);
    if (!rec) return null;
    const c = rec.content;
    if (c instanceof Blob) return c as Blob;
    return String(c ?? '');
  },

  async readText(path: string): Promise<string | null> {
    const v = await this.readFile(path);
    if (v == null) return null;
    if (v instanceof Blob) return await v.text();
    return String(v);
  },

  async readJSON<T = any>(path: string): Promise<T | null> {
    const txt = await this.readText(path);
    if (txt == null) return null;
    try { return JSON.parse(txt) as T; } catch { return null; }
  },

  async writeFile(path: string, content: string | Blob, mime?: string): Promise<void> {
    const p = normPath(path);
    const now = Date.now();
    if (backend === 'folder' && folderFiles) {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
      const file = new File([blob], p.split('/').pop() || 'file', { type: blob.type });
      folderFiles.set(p, file);
      return;
    }
    if (content instanceof Blob) {
      await idbPut({ path: p, mime: mime || content.type || 'application/octet-stream', mtime: now, content });
    } else {
      await idbPut({ path: p, mime: mime || 'text/plain', mtime: now, content });
    }
  },

  async writeText(path: string, text: string, mime = 'text/plain'): Promise<void> {
    await this.writeFile(path, text, mime);
  },

  async writeJSON(path: string, data: any): Promise<void> {
    await this.writeFile(path, JSON.stringify(data, null, 2), 'application/json');
  },

  async newFile(path: string, content: string | Blob, mime?: string): Promise<void> {
    await this.writeFile(path, content, mime);
  },

  async delete(path: string): Promise<void> {
    const p = normPath(path);
    if (backend === 'folder' && folderFiles) { folderFiles.delete(p); return; }
    await idbDelete(p);
  },

  async rename(src: string, dst: string): Promise<void> {
    const s = normPath(src); const d = normPath(dst);
    if (s === d) return;
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(s);
      if (f) { folderFiles.delete(s); folderFiles.set(d, f); }
      return;
    }
    const rec = await idbGet(s);
    if (rec) { await idbPut({ ...rec, path: d }); await idbDelete(s); }
  },

  async copyFile(src: string, dst: string): Promise<void> {
    const s = normPath(src); const d = normPath(dst);
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(s);
      if (f) {
        const blob = new Blob([await f.arrayBuffer()], { type: f.type });
        const file = new File([blob], d.split('/').pop() || 'file', { type: f.type });
        folderFiles.set(d, file);
      }
      return;
    }
    const rec = await idbGet(s);
    if (rec) { await idbPut({ ...rec, path: d }); }
  },

  async getURL(path: string): Promise<string | undefined> {
    const p = normPath(path);
    const cached = resourceURLCache.get(p); if (cached) return cached;
    if (backend === 'folder' && folderFiles) {
      const f = folderFiles.get(p) || folderFiles.get(p.replace(/^\/+/, ''));
      if (f) return cacheBlobURL(p, f);
      return undefined;
    }
    const rec = await idbGet(p);
    if (!rec) return undefined;
    const c = rec.content;
    if (c instanceof Blob) return cacheBlobURL(p, c);
    // For text content, synthesize a Blob URL
    const blob = new Blob([String(c ?? '')], { type: rec.mime || 'text/plain' });
    return cacheBlobURL(p, blob);
  }
};
