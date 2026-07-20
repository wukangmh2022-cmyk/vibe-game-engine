import RemoteUser from './RemoteUser';

type WriteItem = { sceneId: string; key: string; value: any; resolve: (r: any) => void; reject: (e: any) => void };

/**
 * UserDataStore
 * - Local-first user data (backed by localStorage: 'user_data_sheet')
 * - Background sequential remote sync via an in‑memory queue (non‑blocking)
 * - Optional pull from remote to refresh local cache
 */
export class UserDataStore {
  private static _instance: UserDataStore | null = null;
  static get instance(): UserDataStore { return this._instance || (this._instance = new UserDataStore()); }

  private readonly storageKey = 'user_data_sheet';
  private readonly ownerField = '__owner_id__';
  private queue: WriteItem[] = [];
  private inFlight = false;
  private lastPullTs: Map<string, number> = new Map(); // sceneId -> ts
  private activeUserId: string | null = null;

  private getRemoteUser(): any {
    return (RemoteUser as any)?.instance || (RemoteUser as any);
  }

  private getCurrentUserId(): string | null {
    try {
      const user = this.getRemoteUser();
      const raw = user?.userId;
      if (raw == null) return null;
      const str = String(raw).trim();
      return str.length ? str : null;
    } catch { return null; }
  }

  private ensureActiveUserContext(): string | null {
    const uid = this.getCurrentUserId();
    if (this.activeUserId !== uid) {
      this.activeUserId = uid;
      this.queue = [];
      this.lastPullTs.clear();
    }
    return this.activeUserId;
  }

  private createEmptySheet(ownerId: string | null) {
    return { user_nickname: 'default', scene_data: {}, [this.ownerField]: ownerId ?? null };
  }

  // ===== Local cache helpers =====
  private readSheet(): any {
    const ownerId = this.ensureActiveUserContext();
    const fallback = this.createEmptySheet(ownerId ?? null);
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        this.writeSheet(fallback);
        return fallback;
      }
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') {
        this.writeSheet(fallback);
        return fallback;
      }
      if (!obj.scene_data || typeof obj.scene_data !== 'object') obj.scene_data = {};
      const rawOwner = obj[this.ownerField];
      const cachedOwner = (typeof rawOwner === 'string' && rawOwner.trim().length)
        ? String(rawOwner)
        : null;
      const normalizedOwner = ownerId ?? null;
      if (cachedOwner !== normalizedOwner) {
        this.writeSheet(fallback);
        return fallback;
      }
      obj[this.ownerField] = normalizedOwner;
      return obj;
    } catch {
      this.writeSheet(fallback);
      return fallback;
    }
  }
  private writeSheet(sheet: any) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(sheet)); } catch {}
  }
  private ensureGroup(sheet: any, sceneId: string): any {
    const sid = sceneId || '__default__';
    sheet.scene_data = sheet.scene_data || {};
    if (!sheet.scene_data[sid] || typeof sheet.scene_data[sid] !== 'object') sheet.scene_data[sid] = {};
    return sheet.scene_data[sid];
  }

  // Public: get local (no network)
  getLocal(sceneId: string, key?: string): any {
    const sheet = this.readSheet();
    const group = this.ensureGroup(sheet, sceneId);
    return (key ? group[key] : { ...group });
  }

  // Public: set local and enqueue remote sync
  setLocal(sceneId: string, key: string, value: any, enqueueRemote = true): any {
    const sheet = this.readSheet();
    const group = this.ensureGroup(sheet, sceneId);
    group[key] = value;
    this.writeSheet(sheet);
    if (enqueueRemote) this.enqueue(sceneId, key, value);
    return value;
  }

  // Public: apply math op locally and enqueue remote sync
  applyOp(sceneId: string, key: string, op: 'set'|'add'|'sub'|'mul'|'div', rawVal: any): any {
    const sheet = this.readSheet();
    const group = this.ensureGroup(sheet, sceneId);
    const oldVal = group[key];
    // Protection: when key is undefined, initialize with an empty base value first
    if (typeof oldVal === 'undefined') {
      const init = (op === 'mul' || op === 'div') ? 1 : (op === 'set' ? '' : 0);
      group[key] = init;
      this.writeSheet(sheet);
    }
    const toNumber = (v: any) => (typeof v === 'number') ? v : (v != null && /^-?\d+(?:\.\d+)?$/.test(String(v).trim()) ? Number(v) : NaN);
    const coerce = (val: any) => {
      if (typeof val !== 'string') return val;
      const s = val.trim();
      if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
      if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
      if (/^null$/i.test(s)) return null;
      return val;
    };
    let next: any = undefined;
    const base = (typeof group[key] === 'undefined') ? 0 : group[key];
    if (op === 'add') next = (toNumber(base) || 0) + (toNumber(rawVal) || 0);
    else if (op === 'sub') next = (toNumber(base) || 0) - (toNumber(rawVal) || 0);
    else if (op === 'mul') next = (toNumber(base) || 1) * (toNumber(rawVal) || 0);
    else if (op === 'div') {
      const v = toNumber(rawVal) || 0;
      next = (v === 0 ? base : (toNumber(base) || 1) / v);
    } else { next = coerce(rawVal); }
    group[key] = next;
    this.writeSheet(sheet);
    this.enqueue(sceneId, key, next);
    return next;
  }

  // ===== Remote sync queue =====
  private async processQueue() {
    if (this.inFlight) return;
    this.inFlight = true;
    const RU: any = (RemoteUser as any)?.instance || (RemoteUser as any);
    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        try {
          if (!RU || typeof RU.writeData !== 'function' || !RU.token) {
            // Not logged in; wait a bit and retry later
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
          const res = await RU.writeData(item.sceneId, item.key, item.value);
          if ((res as any)?.ok === false) throw new Error((res as any)?.error || 'write failed');
          item.resolve(res);
          this.queue.shift();
        } catch (e) {
          // Simple retry with small delay; keep the item at head
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } finally { this.inFlight = false; }
  }

  private enqueue(sceneId: string, key: string, value: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ sceneId, key, value, resolve, reject });
      // kick off processing (non-blocking)
      void this.processQueue();
    });
  }

  // ===== Remote pull =====
  async pull(sceneId: string, key?: string): Promise<any> {
    this.ensureActiveUserContext();
    const RU: any = (RemoteUser as any)?.instance || (RemoteUser as any);
    if (!RU || typeof RU.readData !== 'function' || !RU.token) return { ok: false, error: 'Not logged in' };
    const res = await RU.readData(sceneId, key);
    if ((res as any)?.ok === false) return res;
    const data = (res as any)?.data;
    if (key) {
      if (data !== undefined) this.setLocal(sceneId, key, data, false);
    } else if (data && typeof data === 'object') {
      const sheet = this.readSheet();
      sheet.scene_data = sheet.scene_data || {};
      sheet.scene_data[sceneId] = { ...(sheet.scene_data[sceneId] || {}), ...data };
      this.writeSheet(sheet);
    }
    this.lastPullTs.set(sceneId, Date.now());
    return { ok: true, data };
  }

  isStale(sceneId: string, maxAgeMs: number): boolean {
    this.ensureActiveUserContext();
    const ts = this.lastPullTs.get(sceneId) || 0;
    return (Date.now() - ts) > Math.max(0, maxAgeMs);
  }

  isLoggedIn(): boolean {
    const RU: any = (RemoteUser as any)?.instance || (RemoteUser as any);
    return !!(RU && RU.token);
  }
}

export default UserDataStore;
