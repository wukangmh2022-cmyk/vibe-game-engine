// Minimal File System Access helpers (optional, Chrome/Edge on secure context)
// We store the last directory handle in IndexedDB so user can reopen like VSCode.

const DB = 'editor-fsa';
const STORE = 'handles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isFsaSupported(): boolean {
  try { return typeof (window as any).showDirectoryPicker === 'function'; } catch { return false; }
}

export async function saveLastHandle(handle: any): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(handle, 'last');
    });
    try { console.info('[FSA] Saved last directory handle'); } catch {}
  } catch {}
}

export async function loadLastHandle(): Promise<any | null> {
  try {
    const db = await openDB();
    const handle = await new Promise<any | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(STORE).get('last');
      req.onsuccess = () => resolve((req.result as any) || null);
      req.onerror = () => reject(req.error);
    });
    try { console.info('[FSA] Loaded last handle:', !!handle); } catch {}
    return handle;
  } catch { return null; }
}

export async function verifyPermission(handle: any, mode: 'read' | 'readwrite' = 'read'): Promise<boolean> {
  try {
    const qs = await (handle as any).queryPermission?.({ mode });
    try { console.info('[FSA] queryPermission:', qs); } catch {}
    if (qs === 'granted') return true;
    const rs = await (handle as any).requestPermission?.({ mode });
    try { console.info('[FSA] requestPermission:', rs); } catch {}
    return rs === 'granted';
  } catch { return false; }
}

export async function buildFileMapFromHandle(dirHandle: any): Promise<Map<string, File>> {
  const map = new Map<string, File>();
  async function walk(dh: any, prefix: string) {
    // for-await entries
    // eslint-disable-next-line no-restricted-syntax
    for await (const [name, entry] of (dh as any).entries()) {
      if ((entry as any).kind === 'file') {
        try {
          const file: File = await (entry as any).getFile();
          const rel = (prefix ? prefix + '/' : '') + String(name);
          map.set(rel, file);
        } catch {}
      } else if ((entry as any).kind === 'directory') {
        try { await walk(entry, (prefix ? prefix + '/' : '') + String(name)); } catch {}
      }
    }
  }
  await walk(dirHandle, '');
  try {
    const preview = Array.from(map.keys()).slice(0, 10);
    console.info('[FSA] Built file map:', map.size, 'entries. sample:', preview);
  } catch {}
  return map;
}

export async function pickDirectory(): Promise<any | null> {
  try { const handle = await (window as any).showDirectoryPicker?.(); return handle || null; } catch { return null; }
}
