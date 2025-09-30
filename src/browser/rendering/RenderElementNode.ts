import { Easings } from '../anim/Easings';

type NullableNumber = number | null | undefined;

export interface RenderedTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  width: number;
  height: number;
}

interface BaseTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  visible: boolean;
}

interface AnimationState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
}

interface KeyframeState {
  time: number;
  state: Partial<AnimationState> & { alpha?: number };
  easing: keyof typeof Easings;
}

interface TimelineData {
  keyframes: KeyframeState[];
  duration: number;
  loop: boolean;
}

const DEFAULT_BASE: BaseTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  alpha: 1,
  visible: true,
};

const DEFAULT_ANIM: AnimationState = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  alpha: 1,
};

const clamp = (v: number, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) => Math.max(min, Math.min(max, v));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const resolveScaleValue = (v: any): { x: number; y: number } | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'number') return { x: v, y: v };
  if (typeof v === 'object') {
    const sx = v.x != null ? Number(v.x) : v.width != null ? Number(v.width) : undefined;
    const sy = v.y != null ? Number(v.y) : v.height != null ? Number(v.height) : undefined;
    return {
      x: sx != null && Number.isFinite(sx) ? sx : 1,
      y: sy != null && Number.isFinite(sy) ? sy : 1,
    };
  }
  return undefined;
};

let nextNodeId = 1;

export class RenderElementNode {
  public readonly id: string;
  public readonly type: string;
  public readonly wrapper: any;
  public readonly animLayer: any;
  public readonly content: any;
  public parent: RenderElementNode | null = null;
  public children: Set<RenderElementNode> = new Set();
  private base: BaseTransform = { ...DEFAULT_BASE };
  private animation: AnimationState = { ...DEFAULT_ANIM };
  private rendered: RenderedTransform = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    width: 0,
    height: 0,
  };
  private pixi: any;
  private sizeLocked = false;
  private width = 0;
  private height = 0;
  private anchorX = 0;
  private anchorY = 0;
  private anchorCenter = false;
  private destroyed = false;
  private dirty = true;
  private currentTimeline: TimelineData | null = null;
  private timelineElapsed = 0;
  private pendingLoop: TimelineData | null = null;
  private loopTimeline: TimelineData | null = null;
  private loopElapsed = 0;
  private playingLoop = false;
  private awaitingEntry = false;
  private timelineRequest = 0;
  private easingCache = new Map<string, (t: number) => number>();
  private fetchTimeline: ((specId: string) => Promise<any | null>) | null = null;
  private fetchContext: any = null;
  private wrapperSetX?: (value: number) => void;
  private wrapperSetY?: (value: number) => void;
  private wrapperSetRotation?: (value: number) => void;
  private wrapperSetAngle?: (value: number) => void;
  private wrapperSetAlpha?: (value: number) => void;
  private wrapperSetVisible?: (value: boolean) => void;
  private wrapperPositionRef: any;
  private wrapperPositionSet?: (x: number, y: number) => void;
  private wrapperScaleRef: any;
  private wrapperScaleSet?: (x: number, y: number) => void;

  constructor(pixi: any, type: string, visual: any, options?: { id?: string }) {
    this.pixi = pixi;
    this.type = type;
    this.id = options?.id || `render-node-${nextNodeId++}`;

    const Container = pixi.Container || (pixi as any).container?.Container;
    this.wrapper = new Container();
    this.wrapper.__elementNode = this;
    this.wrapper.sortableChildren = true;
    this.wrapper.name = this.id;

    this.animLayer = new Container();
    this.animLayer.name = `${this.id}_anim`;
    this.wrapper.addChild(this.animLayer);

    this.content = visual;
    if (visual) {
      this.animLayer.addChild(visual);
    }

    this.setupForwarding();
  }

  private setupForwarding() {
    const node = this.wrapper as any;
    const content = this.content as any;
    node.__animLayer = this.animLayer;
    node.__animTarget = this.animLayer;
    node.__content = content;
    node.__elementNode = this;

    if (content && content.anchor) {
      Object.defineProperty(node, 'anchor', {
        configurable: true,
        enumerable: true,
        get: () => content.anchor,
        set: (val: any) => {
          if (!content.anchor) return;
          try {
            if (typeof val === 'number') content.anchor.set(val);
            else if (val && typeof val === 'object') content.anchor.set(val.x ?? content.anchor.x, val.y ?? content.anchor.y);
          } catch {}
        },
      });
    }

    const findDescriptor = (target: any, prop: string): PropertyDescriptor | undefined => {
      let cur = target;
      while (cur) {
        const desc = Object.getOwnPropertyDescriptor(cur, prop);
        if (desc) return desc;
        cur = Object.getPrototypeOf(cur);
      }
      return undefined;
    };

    const bindSetter = <T extends (...args: any[]) => any>(desc?: PropertyDescriptor, fallback?: T): T | undefined => {
      if (desc && typeof desc.set === 'function') {
        return desc.set as T;
      }
      return fallback;
    };

    const wrapperProto = Object.getPrototypeOf(node);
    this.wrapperSetX = bindSetter(findDescriptor(wrapperProto, 'x'));
    this.wrapperSetY = bindSetter(findDescriptor(wrapperProto, 'y'));
    this.wrapperSetRotation = bindSetter(findDescriptor(wrapperProto, 'rotation'));
    this.wrapperSetAngle = bindSetter(findDescriptor(wrapperProto, 'angle'));
    this.wrapperSetAlpha = bindSetter(findDescriptor(wrapperProto, 'alpha'));
    this.wrapperSetVisible = bindSetter(findDescriptor(wrapperProto, 'visible'));

    const positionDesc = findDescriptor(wrapperProto, 'position');
    this.wrapperPositionRef = positionDesc?.get ? positionDesc.get.call(node) : node.position;
    if (this.wrapperPositionRef && typeof this.wrapperPositionRef.set === 'function') {
      this.wrapperPositionSet = this.wrapperPositionRef.set.bind(this.wrapperPositionRef);
    }

    const scaleDesc = findDescriptor(wrapperProto, 'scale');
    this.wrapperScaleRef = scaleDesc?.get ? scaleDesc.get.call(node) : node.scale;
    if (this.wrapperScaleRef && typeof this.wrapperScaleRef.set === 'function') {
      this.wrapperScaleSet = this.wrapperScaleRef.set.bind(this.wrapperScaleRef);
    }

    const self = this;

    const applyBasePosition = (x: number | undefined, y: number | undefined) => {
      if (x != null && Number.isFinite(x)) {
        if (typeof self.wrapperSetX === 'function') self.wrapperSetX.call(node, x);
        else if (self.wrapperPositionSet) self.wrapperPositionSet(x, self.wrapperPositionRef?.y ?? self.base.y);
        else if (self.wrapperPositionRef) self.wrapperPositionRef.x = x;
      }
      if (y != null && Number.isFinite(y)) {
        if (typeof self.wrapperSetY === 'function') self.wrapperSetY.call(node, y);
        else if (self.wrapperPositionSet) self.wrapperPositionSet(self.wrapperPositionRef?.x ?? self.base.x, y);
        else if (self.wrapperPositionRef) self.wrapperPositionRef.y = y;
      }
    };

    const applyBaseScale = (sx: number | undefined, sy: number | undefined) => {
      if (self.wrapperScaleRef) {
        const nextX = sx != null && Number.isFinite(sx) ? sx : self.wrapperScaleRef.x;
        const nextY = sy != null && Number.isFinite(sy) ? sy : self.wrapperScaleRef.y;
        if (self.wrapperScaleSet) self.wrapperScaleSet(nextX, nextY);
        else {
          if (sx != null && Number.isFinite(sx)) self.wrapperScaleRef.x = sx;
          if (sy != null && Number.isFinite(sy)) self.wrapperScaleRef.y = sy;
        }
      }
    };

    Object.defineProperty(node, 'x', {
      configurable: true,
      enumerable: true,
      get: () => this.base.x,
      set: (val: any) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isFinite(num)) return;
        self.base.x = num;
        applyBasePosition(num, undefined);
        self.markDirty();
      },
    });

    Object.defineProperty(node, 'y', {
      configurable: true,
      enumerable: true,
      get: () => this.base.y,
      set: (val: any) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isFinite(num)) return;
        self.base.y = num;
        applyBasePosition(undefined, num);
        self.markDirty();
      },
    });

    const positionProxy: any = {
      get x() { return node.x; },
      set x(v: any) { node.x = v; },
      get y() { return node.y; },
      set y(v: any) { node.y = v; },
      set: (xVal: any, yVal: any) => {
        const nx = Number(xVal);
        const ny = Number(yVal);
        if (Number.isFinite(nx)) node.x = nx;
        if (Number.isFinite(ny)) node.y = ny;
        return positionProxy;
      },
      copyFrom: (pt: any) => {
        if (!pt) return positionProxy;
        if (pt.x != null) node.x = pt.x;
        if (pt.y != null) node.y = pt.y;
        return positionProxy;
      },
    };

    Object.defineProperty(node, 'position', {
      configurable: true,
      enumerable: true,
      get: () => positionProxy,
      set: (val: any) => {
        if (!val) return;
        if (val.x != null) node.x = val.x;
        if (val.y != null) node.y = val.y;
      },
    });

    Object.defineProperty(node, 'rotation', {
      configurable: true,
      enumerable: true,
      get: () => self.base.rotation,
      set: (val: any) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isFinite(num)) return;
        self.base.rotation = num;
        if (typeof self.wrapperSetRotation === 'function') self.wrapperSetRotation.call(node, num);
        else if (node.transform) node.transform.rotation = num;
        self.markDirty();
      },
    });

    Object.defineProperty(node, 'angle', {
      configurable: true,
      enumerable: true,
      get: () => self.base.rotation * 180 / Math.PI,
      set: (val: any) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isFinite(num)) return;
        const rad = num * Math.PI / 180;
        self.base.rotation = rad;
        if (typeof self.wrapperSetAngle === 'function') self.wrapperSetAngle.call(node, num);
        else if (typeof self.wrapperSetRotation === 'function') self.wrapperSetRotation.call(node, rad);
        else if (node.transform) node.transform.rotation = rad;
        self.markDirty();
      },
    });

    Object.defineProperty(node, 'alpha', {
      configurable: true,
      enumerable: true,
      get: () => self.base.alpha,
      set: (val: any) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isFinite(num)) return;
        self.base.alpha = num;
        if (typeof self.wrapperSetAlpha === 'function') self.wrapperSetAlpha.call(node, num);
        else node._alpha = num;
        self.markDirty();
      },
    });

    Object.defineProperty(node, 'visible', {
      configurable: true,
      enumerable: true,
      get: () => self.base.visible,
      set: (val: any) => {
        const bool = !!val;
        self.base.visible = bool;
        if (typeof self.wrapperSetVisible === 'function') self.wrapperSetVisible.call(node, bool);
        else node._visible = bool;
        self.markDirty();
      },
    });

    const scaleProxy: any = {
      get x() { return self.base.scaleX; },
      set x(v: any) {
        const num = Number(v);
        if (!Number.isFinite(num)) return;
        self.base.scaleX = num;
        applyBaseScale(num, undefined);
        self.markDirty();
      },
      get y() { return self.base.scaleY; },
      set y(v: any) {
        const num = Number(v);
        if (!Number.isFinite(num)) return;
        self.base.scaleY = num;
        applyBaseScale(undefined, num);
        self.markDirty();
      },
      set: (sx: any, sy?: any) => {
        const nx = Number(sx);
        const ny = sy == null ? nx : Number(sy);
        if (Number.isFinite(nx)) {
          self.base.scaleX = nx;
        }
        if (Number.isFinite(ny)) {
          self.base.scaleY = ny;
        }
        applyBaseScale(Number.isFinite(nx) ? nx : undefined, Number.isFinite(ny) ? ny : undefined);
        self.markDirty();
        return scaleProxy;
      },
      copyFrom: (pt: any) => {
        if (!pt) return scaleProxy;
        if (pt.x != null) scaleProxy.x = pt.x;
        if (pt.y != null) scaleProxy.y = pt.y;
        return scaleProxy;
      },
      clone: () => ({ x: scaleProxy.x, y: scaleProxy.y }),
    };

    Object.defineProperty(node, 'scale', {
      configurable: true,
      enumerable: true,
      get: () => scaleProxy,
      set: (val: any) => {
        if (val == null) return;
        if (typeof val === 'number') {
          scaleProxy.set(val, val);
          return;
        }
        if (typeof val === 'object') {
          if (val.x != null) scaleProxy.x = val.x;
          if (val.y != null) scaleProxy.y = val.y;
          return;
        }
      },
    });

    Object.defineProperty(node, 'width', {
      configurable: true,
      enumerable: true,
      get: () => {
        if (content && content.width != null) return content.width;
        return this.width;
      },
      set: (val: any) => {
        const num = Number(val);
        if (content && content.width != null && Number.isFinite(num) && num >= 0) {
          content.width = num;
          this.width = num;
          this.sizeLocked = true;
          this.markDirty();
        }
      },
    });

    Object.defineProperty(node, 'height', {
      configurable: true,
      enumerable: true,
      get: () => {
        if (content && content.height != null) return content.height;
        return this.height;
      },
      set: (val: any) => {
        const num = Number(val);
        if (content && content.height != null && Number.isFinite(num) && num >= 0) {
          content.height = num;
          this.height = num;
          this.sizeLocked = true;
          this.markDirty();
        }
      },
    });

    node.getRenderedTransform = () => this.getRenderedTransform();
    node.getRenderedX = () => this.getRenderedTransform().x;
    node.getRenderedY = () => this.getRenderedTransform().y;
    node.getRenderedScale = () => ({ x: this.getRenderedTransform().scaleX, y: this.getRenderedTransform().scaleY });
    node.getRenderedRotation = () => this.getRenderedTransform().rotation;
    node.getRenderedAlpha = () => this.getRenderedTransform().alpha;
    node.getBaseTransform = () => ({ ...this.base });
    node.getAnimationTransform = () => ({ ...this.animation });
  }

  setFetchResolver(resolver: (specId: string) => Promise<any | null>, context: any) {
    this.fetchTimeline = resolver;
    this.fetchContext = context;
  }

  setBasePosition(x?: NullableNumber, y?: NullableNumber) {
    if (x != null && Number.isFinite(Number(x))) this.base.x = Number(x);
    if (y != null && Number.isFinite(Number(y))) this.base.y = Number(y);
    this.markDirty();
  }

  setBaseScale(scale?: { x?: NullableNumber; y?: NullableNumber }) {
    if (!scale) return;
    if (scale.x != null && Number.isFinite(Number(scale.x))) this.base.scaleX = Number(scale.x);
    if (scale.y != null && Number.isFinite(Number(scale.y))) this.base.scaleY = Number(scale.y);
    this.markDirty();
  }

  setBaseRotation(rotation?: NullableNumber) {
    if (rotation == null) return;
    this.base.rotation = Number(rotation);
    this.markDirty();
  }

  setBaseAlpha(alpha?: NullableNumber) {
    if (alpha == null) return;
    this.base.alpha = Number(alpha);
    this.markDirty();
  }

  setVisible(v: boolean | undefined) {
    if (typeof v !== 'boolean') return;
    this.base.visible = v;
    this.markDirty();
  }

  setSize(width?: NullableNumber, height?: NullableNumber) {
    let changed = false;
    if (width != null && Number.isFinite(Number(width)) && Number(width) >= 0) {
      this.width = Number(width);
      if (this.content && this.content.width != null) {
        this.content.width = this.width;
      }
      changed = true;
    }
    if (height != null && Number.isFinite(Number(height)) && Number(height) >= 0) {
      this.height = Number(height);
      if (this.content && this.content.height != null) {
        this.content.height = this.height;
      }
      changed = true;
    }
    if (changed) {
      this.sizeLocked = true;
      this.markDirty();
    }
  }

  setAnchor(ax?: NullableNumber, ay?: NullableNumber, center?: boolean) {
    if (center === true) this.anchorCenter = true;
    if (ax != null) this.anchorX = Number(ax);
    if (ay != null) this.anchorY = Number(ay);
    if (this.content && this.content.anchor) {
      try {
        if (this.anchorCenter) this.content.anchor.set(0.5, 0.5);
        else this.content.anchor.set(this.anchorX ?? this.content.anchor.x ?? 0, this.anchorY ?? this.content.anchor.y ?? 0);
      } catch {}
    }
    this.markDirty();
  }

  setSizeLocked(lock: boolean) {
    this.sizeLocked = lock;
  }

  isSizeLocked(): boolean {
    return this.sizeLocked;
  }

  resetAnimation() {
    this.animation = { ...DEFAULT_ANIM };
    this.markDirty();
  }

  setAnimationState(next: Partial<AnimationState>) {
    if (next.x != null && Number.isFinite(Number(next.x))) this.animation.x = Number(next.x);
    if (next.y != null && Number.isFinite(Number(next.y))) this.animation.y = Number(next.y);
    if (next.scaleX != null && Number.isFinite(Number(next.scaleX))) this.animation.scaleX = Number(next.scaleX);
    if (next.scaleY != null && Number.isFinite(Number(next.scaleY))) this.animation.scaleY = Number(next.scaleY);
    if (next.rotation != null && Number.isFinite(Number(next.rotation))) this.animation.rotation = Number(next.rotation);
    if (next.alpha != null && Number.isFinite(Number(next.alpha))) this.animation.alpha = Number(next.alpha);
    this.markDirty();
  }

  attachTo(parent: RenderElementNode | null) {
    if (this.parent === parent) return;
    if (this.parent) {
      try { this.parent.animLayer.removeChild(this.wrapper); } catch {}
      this.parent.children.delete(this);
    }
    this.parent = parent;
    if (parent) {
      parent.children.add(this);
      try { parent.animLayer.addChild(this.wrapper); } catch {}
    }
    this.markDirty();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.parent) {
      try { this.parent.children.delete(this); } catch {}
    }
    try { this.wrapper.removeChildren(); } catch {}
    try { this.animLayer.removeChildren(); } catch {}
    try { this.wrapper.destroy?.({ children: true, texture: false, baseTexture: false }); } catch {}
  }

  update(deltaMS: number) {
    if (this.currentTimeline) {
      this.timelineElapsed += deltaMS;
      if (!this.playingLoop) {
        const done = this.timelineElapsed >= this.currentTimeline.duration;
        const frame = this.sampleTimeline(this.currentTimeline, Math.min(this.timelineElapsed, this.currentTimeline.duration));
        this.setAnimationState(frame);
        if (done) {
          this.currentTimeline = null;
          this.timelineElapsed = 0;
          this.playingLoop = false;
          if (this.pendingLoop) {
            this.loopTimeline = this.pendingLoop;
            this.pendingLoop = null;
            this.loopElapsed = 0;
            this.playingLoop = true;
          } else {
            this.resetAnimation();
          }
        }
      }
    }

    if (this.loopTimeline) {
      this.loopElapsed += deltaMS;
      const duration = this.loopTimeline.duration;
      if (duration <= 0) {
        this.loopElapsed = 0;
      }
      const t = duration > 0 ? this.loopElapsed % duration : 0;
      const frame = this.sampleTimeline(this.loopTimeline, t);
      this.setAnimationState(frame);
    }

    if (this.dirty) this.applyTransforms();
  }

  private getEase(easing: keyof typeof Easings): (t: number) => number {
    if (!easing) return Easings.easeInOutQuad;
    if (!this.easingCache.has(easing)) {
      const fn = Easings[easing] || Easings.easeInOutQuad;
      this.easingCache.set(easing, fn);
    }
    return this.easingCache.get(easing)!;
  }

  private sampleTimeline(timeline: TimelineData, time: number): Partial<AnimationState> {
    if (timeline.keyframes.length === 0) return {};
    if (timeline.keyframes.length === 1) return timeline.keyframes[0].state;
    const frames = timeline.keyframes;
    let prev = frames[0];
    let next = frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i];
      const b = frames[i + 1];
      if (time >= a.time && time <= b.time) {
        prev = a;
        next = b;
        break;
      }
      if (time > b.time) {
        prev = b;
      }
    }
    const span = Math.max(0.0001, next.time - prev.time);
    const ease = this.getEase(next.easing || 'easeInOutQuad');
    const k = clamp((time - prev.time) / span, 0, 1);
    const eased = ease(k);
    const out: Partial<AnimationState> = {};
    const props: (keyof AnimationState)[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'alpha'];
    for (const prop of props) {
      const pv = (prev.state as any)[prop];
      const nv = (next.state as any)[prop];
      if (pv == null && nv == null) continue;
      if (pv == null) {
        out[prop] = nv;
      } else if (nv == null) {
        out[prop] = pv;
      } else {
        out[prop] = lerp(Number(pv), Number(nv), eased);
      }
    }
    return out;
  }

  private markDirty() {
    this.dirty = true;
  }

  private applyTransforms() {
    this.dirty = false;
    try {
      if (typeof this.wrapperSetX === 'function') this.wrapperSetX.call(this.wrapper, this.base.x);
      else if (this.wrapperPositionRef) this.wrapperPositionRef.x = this.base.x;
      if (typeof this.wrapperSetY === 'function') this.wrapperSetY.call(this.wrapper, this.base.y);
      else if (this.wrapperPositionRef) this.wrapperPositionRef.y = this.base.y;
      if (this.wrapperScaleSet) this.wrapperScaleSet(this.base.scaleX, this.base.scaleY);
      else if (this.wrapperScaleRef) {
        this.wrapperScaleRef.x = this.base.scaleX;
        this.wrapperScaleRef.y = this.base.scaleY;
      }
      if (typeof this.wrapperSetRotation === 'function') this.wrapperSetRotation.call(this.wrapper, this.base.rotation);
      else if (this.wrapper.transform) this.wrapper.transform.rotation = this.base.rotation;
      if (typeof this.wrapperSetAlpha === 'function') this.wrapperSetAlpha.call(this.wrapper, this.base.alpha);
      else (this.wrapper as any)._alpha = this.base.alpha;
      if (typeof this.wrapperSetVisible === 'function') this.wrapperSetVisible.call(this.wrapper, this.base.visible);
      else (this.wrapper as any)._visible = this.base.visible;
    } catch {}

    try {
      this.animLayer.x = this.animation.x;
      this.animLayer.y = this.animation.y;
      if (this.animLayer.scale) {
        this.animLayer.scale.x = this.animation.scaleX;
        this.animLayer.scale.y = this.animation.scaleY;
      }
      this.animLayer.rotation = this.animation.rotation;
      this.animLayer.alpha = this.animation.alpha;
    } catch {}

    this.updateRenderedTransform();
  }

  private updateRenderedTransform() {
    try {
      const global = this.animLayer.getGlobalPosition(new this.pixi.Point());
      const wt = this.animLayer.worldTransform;
      const scaleX = Math.sqrt((wt.a * wt.a) + (wt.b * wt.b));
      const scaleY = Math.sqrt((wt.c * wt.c) + (wt.d * wt.d));
      const rotation = Math.atan2(wt.b, wt.a);
      const alpha = this.animLayer.worldAlpha ?? (this.wrapper.worldAlpha ?? this.base.alpha);
      const width = this.width || (this.content?.width ?? 0);
      const height = this.height || (this.content?.height ?? 0);
      this.rendered = {
        x: global.x,
        y: global.y,
        scaleX,
        scaleY,
        rotation,
        alpha,
        width: width * scaleX,
        height: height * scaleY,
      };
    } catch {
      // ignore
    }
  }

  getRenderedTransform(): RenderedTransform {
    return { ...this.rendered };
  }

  getBaseSnapshot(): BaseTransform {
    return { ...this.base };
  }

  getAnimationSnapshot(): AnimationState {
    return { ...this.animation };
  }

  async setEntryTimeline(specId: string, options: { timeline?: any; duration?: number; resolver?: (spec: string) => Promise<any | null>; context?: any }) {
    if (!specId) return;
    this.timelineRequest++;
    const req = this.timelineRequest;
    if (options.resolver) {
      this.setFetchResolver(options.resolver, options.context);
    }
    const data = options.timeline || (await this.fetchTimeline?.(specId));
    if (!data) return;
    if (req !== this.timelineRequest) return;
    const timeline = this.buildTimeline(data, options.duration);
    this.currentTimeline = timeline;
    this.timelineElapsed = 0;
    this.pendingLoop = null;
    this.loopTimeline = null;
    this.loopElapsed = 0;
    this.playingLoop = false;
    this.resetAnimation();
  }

  async setLoopTimeline(specId: string, options: { timeline?: any; duration?: number; resolver?: (spec: string) => Promise<any | null>; context?: any; startAfterEntry?: boolean }) {
    if (!specId) return;
    this.timelineRequest++;
    const req = this.timelineRequest;
    if (options.resolver) {
      this.setFetchResolver(options.resolver, options.context);
    }
    const data = options.timeline || (await this.fetchTimeline?.(specId));
    if (!data) return;
    if (req !== this.timelineRequest) return;
    const timeline = this.buildTimeline(data, options.duration, true);
    if (options.startAfterEntry && this.currentTimeline) {
      this.pendingLoop = timeline;
    } else {
      this.loopTimeline = timeline;
      this.loopElapsed = 0;
      this.pendingLoop = null;
      this.playingLoop = true;
    }
  }

  clearLoopTimeline() {
    this.loopTimeline = null;
    this.loopElapsed = 0;
    this.pendingLoop = null;
    this.playingLoop = false;
    this.resetAnimation();
  }

  private buildTimeline(data: any, overrideDuration?: number, loop = false): TimelineData {
    const parseMs = (v: any): number => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      const s = String(v).trim();
      if (/^\d+(\.\d+)?s$/i.test(s)) return Math.round(parseFloat(s) * 1000);
      if (/^\d+(\.\d+)?ms$/i.test(s)) return Math.round(parseFloat(s));
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const rawTimeline = Array.isArray(data?.timeline) ? data.timeline : [];
    const baseSnapshot = this.getBaseSnapshot();
    const keyframes: KeyframeState[] = [];
    const relative = data?.relative != null ? !!data.relative : this.isSizeLocked();
    const durationOverride = overrideDuration != null ? parseMs(overrideDuration) : parseMs(data?.duration ?? data?.period ?? data?.cycle ?? (data?.seconds != null ? Number(data.seconds) * 1000 : undefined));

    const safeAlpha = (v: any, fallback: number) => {
      const num = Number(v);
      if (!Number.isFinite(num)) return fallback;
      return clamp(num, 0, 1);
    };

    const convertProps = (props: any): Partial<AnimationState> => {
      const out: Partial<AnimationState> = {};
      if (!props) return out;

      const scale = resolveScaleValue(props.scale);
      if (scale) {
        if (out.scaleX == null) out.scaleX = scale.x;
        if (out.scaleY == null) out.scaleY = scale.y;
      }
      if (props.scaleX != null) out.scaleX = Number(props.scaleX);
      if (props.scaleY != null) out.scaleY = Number(props.scaleY);
      if (props.x != null) out.x = Number(props.x);
      if (props.y != null) out.y = Number(props.y);
      if (props.alpha != null) out.alpha = Number(props.alpha);
      if (props.rotation != null) out.rotation = Number(props.rotation);
      if (props.angle != null) out.rotation = Number(props.angle) * Math.PI / 180;
      return out;
    };

    for (const entry of rawTimeline) {
      if (!entry) continue;
      const time = parseMs(entry.time);
      const props = convertProps(entry.props);
      const easing: keyof typeof Easings = entry.ease || 'easeInOutQuad';

      const state: Partial<AnimationState> = {};
      if (props.x != null) {
        const abs = relative ? baseSnapshot.x + props.x : props.x;
        state.x = abs - baseSnapshot.x;
      }
      if (props.y != null) {
        const abs = relative ? baseSnapshot.y + props.y : props.y;
        state.y = abs - baseSnapshot.y;
      }
      if (props.scaleX != null) {
        const abs = relative ? baseSnapshot.scaleX * props.scaleX : props.scaleX;
        const denom = baseSnapshot.scaleX === 0 ? 1 : baseSnapshot.scaleX;
        state.scaleX = abs / denom;
      }
      if (props.scaleY != null) {
        const abs = relative ? baseSnapshot.scaleY * props.scaleY : props.scaleY;
        const denom = baseSnapshot.scaleY === 0 ? 1 : baseSnapshot.scaleY;
        state.scaleY = abs / denom;
      }
      if (props.rotation != null) {
        const abs = relative ? baseSnapshot.rotation + props.rotation : props.rotation;
        state.rotation = abs - baseSnapshot.rotation;
      }
      if (props.alpha != null) {
        const abs = relative ? baseSnapshot.alpha * props.alpha : props.alpha;
        const denom = baseSnapshot.alpha === 0 ? 1 : baseSnapshot.alpha;
        state.alpha = abs / denom;
      }

      keyframes.push({ time, state, easing });
    }

    if (keyframes.length === 0) {
      keyframes.push({ time: 0, state: {}, easing: 'easeInOutQuad' });
    }

    keyframes.sort((a, b) => a.time - b.time);

    let duration = keyframes[keyframes.length - 1].time;
    if (durationOverride && durationOverride > 0) {
      const scaleFactor = duration > 0 ? durationOverride / duration : 1;
      duration = durationOverride;
      keyframes.forEach(k => { k.time = Math.round(k.time * scaleFactor); });
    }

    return {
      keyframes,
      duration,
      loop,
    };
  }
}

