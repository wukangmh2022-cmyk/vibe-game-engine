import { IAudioManager, ResourceId, AudioOptions } from '../types';

type Playing = {
  id: string;
  type: 'sound' | 'music';
  source: HTMLAudioElement | OscillatorNode;
  gain?: GainNode;
};

export class BrowserAudioManager implements IAudioManager {
  private volume = 1;
  private ctx: AudioContext | null = null;
  private playing = new Map<string, Playing>();
  private unlocked = false;
  private resolveUrl: ((id: string) => string | undefined) | null = null;

  private ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  private unlockOnce() {
    if (this.unlocked) return;
    const resume = () => {
      this.ensureCtx();
      this.ctx!.resume();
      this.unlocked = true;
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('touchstart', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  setGlobalVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); }
  mute(): void { this.volume = 0; this.updateAllGains(); }
  unmute(): void { this.volume = 1; this.updateAllGains(); }

  private updateAllGains() {
    for (const p of this.playing.values()) {
      if (p.gain) p.gain.gain.value = this.volume;
      if (p.source instanceof HTMLAudioElement) p.source.volume = this.volume;
    }
  }

  setResolver(fn: (id: string) => string | undefined) { this.resolveUrl = fn; }

  playSound(id: ResourceId, options?: AudioOptions): any {
    this.unlockOnce();
    const url = this.resolveUrl?.(String(id));
    if (!url) {
      console.warn('[Audio] sound resource not found:', String(id));
      return null;
    }
    const el = new Audio(url);
    el.volume = (options?.volume ?? 1) * this.volume;
    el.loop = !!options?.loop;
    el.play().catch(()=>{});
    const key = String(id) + '_' + Date.now();
    this.playing.set(key, { id: String(id), type: 'sound', source: el });
    el.addEventListener('ended', () => this.playing.delete(key), { once: true });
    return { id, type: 'sound' } as any;
  }

  playMusic(id: ResourceId, options?: AudioOptions): void {
    this.unlockOnce();
    const key = String(id);
    const url = this.resolveUrl?.(key);
    // stop previous
    const prev = this.playing.get(key);
    if (prev) { try {
      if (prev.source instanceof OscillatorNode) prev.source.stop();
      if (prev.source instanceof HTMLAudioElement) prev.source.pause();
    } catch {} finally { this.playing.delete(key); } }
    if (!url) {
      console.warn('[Audio] music resource not found:', key);
      return;
    }
    const el = new Audio(url);
    el.loop = options?.loop ?? true;
    el.volume = (options?.volume ?? 0.6) * this.volume;
    el.play().catch(()=>{});
    this.playing.set(key, { id: key, type: 'music', source: el });
  }

  stopAudio(id: ResourceId): void {
    const key = String(id);
    const it = this.playing.get(key);
    if (!it) return;
    try {
      if (it.source instanceof OscillatorNode) it.source.stop();
      if (it.source instanceof HTMLAudioElement) it.source.pause();
    } catch {}
    this.playing.delete(key);
  }

  // Not in IAudioManager interface; used for cleanup on dispose
  stopAll(): void {
    try {
      for (const [key, it] of Array.from(this.playing.entries())) {
        try {
          if (it.source instanceof OscillatorNode) it.source.stop();
          if (it.source instanceof HTMLAudioElement) {
            it.source.pause();
            try { (it.source as any).currentTime = 0; } catch {}
          }
        } catch {}
        this.playing.delete(key);
      }
    } catch {}
  }

  // Stop only SFX, keep BGM (music) playing. Useful when switching scenes.
  stopAllSounds(): void {
    try {
      for (const [key, it] of Array.from(this.playing.entries())) {
        if (it.type !== 'sound') continue;
        try {
          if (it.source instanceof OscillatorNode) it.source.stop();
          if (it.source instanceof HTMLAudioElement) {
            it.source.pause();
            try { (it.source as any).currentTime = 0; } catch {}
          }
        } catch {}
        this.playing.delete(key);
      }
    } catch {}
  }

  // Stop only BGM/music. Useful when starting a new track across scenes.
  stopAllMusic(): void {
    try {
      for (const [key, it] of Array.from(this.playing.entries())) {
        if (it.type !== 'music') continue;
        try {
          if (it.source instanceof OscillatorNode) it.source.stop();
          if (it.source instanceof HTMLAudioElement) {
            it.source.pause();
            try { (it.source as any).currentTime = 0; } catch {}
          }
        } catch {}
        this.playing.delete(key);
      }
    } catch {}
  }

  dispose(): void {
    try { this.stopAll(); } catch {}
    try { this.ctx?.close?.(); } catch {}
    this.ctx = null;
  }
}
