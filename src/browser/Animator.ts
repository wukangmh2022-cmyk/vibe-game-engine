import { Easings } from './anim/Easings';

type EasingName = keyof typeof Easings;

export class Animator {
  private loops = new Map<any, { stop: () => void }>();

  animate(node: any, propsFrom: any, propsTo: any, duration = 800, easing: EasingName = 'easeInOutQuad'): Promise<void> {
    return new Promise(resolve => {
      const start = performance.now();
      const ease = Easings[easing] || Easings.easeInOutQuad;
      const token = node && typeof node === 'object' ? (node.__animToken || 0) : 0;
      if (propsFrom) this.apply(node, propsFrom);
      const tick = (now: number) => {
        if (node && typeof node === 'object' && (node.__animToken || 0) !== token) { return resolve(); }
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        this.interpolate(node, propsFrom, propsTo, k);
        if (t < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  loopHoverY(node: any, amplitude = 6, duration = 1500): void {
    this.stop(node);
    const startY = node.y;
    let raf = 0; let running = true; const start = performance.now();
    const step = (now: number) => {
      if (!running) return;
      const t = (now - start) / duration;
      node.y = startY + Math.sin(t * Math.PI * 2) * amplitude;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    this.loops.set(node, { stop: () => { running = false; cancelAnimationFrame(raf); node.y = startY; } });
  }

  loopPulseScale(node: any, minScale = 0.95, maxScale = 1.05, duration = 1200): void {
    this.stop(node);
    const sx0 = node.scale?.x ?? 1, sy0 = node.scale?.y ?? 1;
    let raf = 0; let running = true; const start = performance.now();
    const step = (now: number) => {
      if (!running) return;
      const t = (now - start) / duration;
      const k = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const sx = sx0 * (minScale + (maxScale - minScale) * k);
      const sy = sy0 * (minScale + (maxScale - minScale) * k);
      if (node.scale) { node.scale.x = sx; node.scale.y = sy; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    this.loops.set(node, { stop: () => { running = false; cancelAnimationFrame(raf); if (node.scale) { node.scale.x = sx0; node.scale.y = sy0; } } });
  }

  stop(node: any) {
    const l = this.loops.get(node);
    if (l) { try { l.stop(); } catch {} this.loops.delete(node); }
  }

  private apply(node: any, props: any) {
    if (!props) return;
    if (props.alpha !== undefined) node.alpha = props.alpha;
    if (props.x !== undefined) node.x = props.x;
    if (props.y !== undefined) node.y = props.y;
    if (props.scale !== undefined) {
      const sx = props.scale.x ?? props.scale; const sy = props.scale.y ?? props.scale;
      if (node.scale) { node.scale.x = sx; node.scale.y = sy; }
    }
  }

  private interpolate(node: any, from: any, to: any, k: number) {
    if (!to) return;
    if (to.alpha !== undefined) node.alpha = this.lerp(from?.alpha ?? node.alpha ?? 1, to.alpha, k);
    if (to.x !== undefined) node.x = this.lerp(from?.x ?? node.x ?? 0, to.x, k);
    if (to.y !== undefined) node.y = this.lerp(from?.y ?? node.y ?? 0, to.y, k);
    if (to.scale !== undefined && node.scale) {
      const fx = from?.scale?.x ?? from?.scale ?? node.scale.x ?? 1;
      const fy = from?.scale?.y ?? from?.scale ?? node.scale.y ?? 1;
      const tx = to.scale.x ?? to.scale; const ty = to.scale.y ?? to.scale;
      node.scale.x = this.lerp(fx, tx, k);
      node.scale.y = this.lerp(fy, ty, k);
    }
  }

  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
}
