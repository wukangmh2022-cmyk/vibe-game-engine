import { IResourceManager, ResourceConfig, ResourceId } from '../types';

export class BrowserResourceManager implements IResourceManager {
  private map = new Map<ResourceId, any>();
  private skins = new Map<string, { imageId?: string; url?: string; slice?: { left: number; top: number; right: number; bottom: number } }>();

  private normalize(url?: string): string | undefined {
    if (!url) return url;
    try {
      // If absolute scheme (http, https, blob, data, file, etc.) or already parent-relative/rooted, keep
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('/') || url.startsWith('../')) return url;

      const g: any = (typeof window !== 'undefined' ? (window as any) : (globalThis as any));
      const base: string | undefined = g?.__ASSET_BASE__ || g?.__PROJECT_BASE__;
      if (base) {
        const clean = url.replace(/^\.\/+/, '').replace(/^\.\//, '');
        const joined = (base.endsWith('/') ? `${base}${clean}` : `${base}/${clean}`);
        return joined;
      }
    } catch {}
    // Strip leading './' and fallback for web runtime pathing
    if (url.startsWith('./')) url = url.slice(2);
    return `../${url}`;
  }

  async loadResource(config: ResourceConfig): Promise<any> {
    const normalized = { ...config, url: this.normalize((config as any).url) } as any;
    this.map.set(config.id, normalized);
    return normalized;
  }

  getResource(id: ResourceId): any {
    return this.map.get(id);
  }

  async preloadResources(configs: ResourceConfig[]): Promise<void> {
    for (const c of configs) {
      const normalized = { ...c, url: this.normalize((c as any).url) } as any;
      this.map.set(c.id, normalized);
    }
  }

  unloadResource(id: ResourceId): void {
    this.map.delete(id);
  }

  // Skins support
  setSkins(arr: Array<{ id: string; imageId?: string; url?: string; slice?: any }> | Record<string, any>) {
    this.skins.clear();
    if (Array.isArray(arr)) {
      arr.forEach(s => { if (s?.id && (s?.imageId || s?.url)) this.skins.set(s.id, { imageId: s.imageId, url: this.normalize(s.url), slice: s.slice }); });
    } else if (arr && typeof arr === 'object') {
      Object.values(arr).forEach((group: any) => {
        if (Array.isArray(group)) group.forEach((s: any) => { if (s?.id && (s?.imageId || s?.url)) this.skins.set(s.id, { imageId: s.imageId, url: this.normalize(s.url), slice: s.slice }); });
      });
    }
  }
  getSkin(id: string) { return this.skins.get(id); }
}
