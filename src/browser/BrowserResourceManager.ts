import { IResourceManager, ResourceConfig, ResourceId } from '../types';

export class BrowserResourceManager implements IResourceManager {
  private map = new Map<ResourceId, any>();

  private normalize(url?: string): string | undefined {
    if (!url) return url;
    // If absolute or already parent-relative, keep
    if (/^(https?:)?\/\//.test(url) || url.startsWith('/') || url.startsWith('../')) return url;
    // Strip leading './'
    if (url.startsWith('./')) url = url.slice(2);
    // runtime.html is under /web, assets live under repo root => prefix '../'
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
}
