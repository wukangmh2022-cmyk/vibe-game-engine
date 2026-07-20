/**
 * RemoteUser: simple singleton client for user auth + KV storage.
 * NOTE: This client assumes a JSON HTTP API at a fixed endpoint.
 * Endpoints (example):
 *   POST /register   { userId, password }
 *   POST /login      { userId, password } -> { token }
 *   POST /login_with_token { token } -> { token, userId }  // 新增token登录接口
 *   POST /logout     { token }
 *   POST /write      { token, sceneId, key, value }
 *   POST /read       { token, sceneId, key? } -> { value | group }
 */
export class RemoteUser {
  private static _instance: RemoteUser | null = null;
  static get instance(): RemoteUser {
    if (!this._instance) this._instance = new RemoteUser();
    return this._instance!;
  }

  // Hard-coded remote endpoint; allow override via global for testing
  private endpoint: string = (typeof (globalThis as any).__REMOTE_USER_ENDPOINT__ === 'string')
    ? (globalThis as any).__REMOTE_USER_ENDPOINT__
    : 'http://47.108.203.64:5000';

  private tokenKey = '__REMOTE_USER_TOKEN__';
  private idKey = '__REMOTE_USER_ID__';

  get token(): string | null {
    try { return localStorage.getItem(this.tokenKey); } catch { return null; }
  }
  private set token(v: string | null) {
    if (v == null) localStorage.removeItem(this.tokenKey);
    else localStorage.setItem(this.tokenKey, v);
  }
  get userId(): string | null {
    try { return localStorage.getItem(this.idKey); } catch { return null; }
  }
  private set userId(v: string | null) {
    try {
      if (v == null) localStorage.removeItem(this.idKey);
      else localStorage.setItem(this.idKey, v);
    } catch {}
  }

  isLoggedIn(): boolean { return !!this.token; }

  async register(userId: string, password: string): Promise<{ ok: boolean; error?: string }> {
    return this.post('/register', { userId, password });
  }

  async login(userId: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const res = await this.post('/login', { userId, password });
    if (res && (res as any).ok !== false && (res as any).token) {
      this.token = String((res as any).token);
      this.userId = String(userId);
      return { ok: true };
    }
    const err = (res && (res as any).error) ? String((res as any).error) : 'Login failed';
    return { ok: false, error: err };
  }

  /**
   * 使用保存的token登录（自动登录）
   * 失败时需要回退到用户名密码登录
   */
  async loginWithToken(): Promise<{ ok: boolean; error?: string; userId?: string }> {
    const savedToken = this.token;
    if (!savedToken) {
      return { ok: false, error: 'No saved token' };
    }

    const res = await this.post('/login_with_token', { token: savedToken });
    if (res && (res as any).ok !== false && (res as any).token) {
      // 更新为新token
      this.token = String((res as any).token);
      // 如果有返回userId，也更新
      let resolvedUserId: string | undefined;
      if ((res as any).userId) {
        resolvedUserId = String((res as any).userId);
        this.userId = resolvedUserId;
      }
      return { ok: true, userId: resolvedUserId ?? undefined };
    }
    
    // Token登录失败，清除本地保存的token
    this.token = null;
    this.userId = null;
    
    const err = (res && (res as any).error) ? String((res as any).error) : 'Token login failed';
    return { ok: false, error: err };
  }

  async logout(): Promise<{ ok: boolean; error?: string }> {
    const t = this.token;
    try {
      if (t) await this.post('/logout', { token: t });
    } finally {
      this.token = null; this.userId = null;
    }
    return { ok: true };
  }

  async writeData(_sceneId: string, key: string, value: any): Promise<{ ok: boolean; error?: string }> {
    const t = this.token;
    if (!t) return { ok: false, error: 'Not logged in' };
    const sceneId = 'default';
    return this.post('/write', { token: t, sceneId, key, value });
  }

  async readData(_sceneId: string, key?: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    const t = this.token;
    if (!t) return { ok: false, error: 'Not logged in' };
    const sceneId = 'default';
    const res = await this.post('/read', { token: t, sceneId, key });
    if (res && (res as any).ok !== false) return { ok: true, data: (res as any).data };
    return { ok: false, error: (res && (res as any).error) ? String((res as any).error) : 'Read failed' };
  }

  private async post(path: string, body: any): Promise<any> {
    const url = this.endpoint.replace(/\/$/, '') + path;
    try {
      this.logCurl(path, body);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {})
      } as any);

      const raw = await resp.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!resp.ok) {
        const serverError = (data && typeof data.error === 'string') ? data.error : null;
        const error = serverError ?? `HTTP ${resp.status}`;
        return { ok: false, error };
      }

      return data;
    } catch (e) {
      return { ok: false, error: (e instanceof Error ? e.message : String(e)) } as any;
    }
  }

  private logCurl(path: string, body: any): void {
    try {
      const url = this.endpoint.replace(/\/$/, '') + path;
      const payload = JSON.stringify(body ?? {});
      const escapedPayload = payload.replace(/'/g, `'\"'\"'`);
      const curlCmd = `curl -X POST -H "Content-Type: application/json" -d '${escapedPayload}' "${url}"`;
      console.info(`[RemoteUser] ${curlCmd}`);
    } catch (err) {
      console.warn('[RemoteUser] Failed to log curl command', err);
    }
  }
}

export default RemoteUser;
