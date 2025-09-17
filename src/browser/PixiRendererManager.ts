// Minimal Pixi-based IRendererManager implementation for browser
import { IRendererManager, ElementConfig, RenderElement } from '../types';

declare const PIXI: any;

export class PixiRendererManager implements IRendererManager {
  private app: any;
  private elements = new Map<string, any>();
  private dropZones = new Map<string, { x: number; y: number; w: number; h: number; accept?: string[] }>();
  private pixi: any;

  constructor(app: any, pixiRef?: any) {
    this.app = app;
    this.pixi = pixiRef || (typeof PIXI !== 'undefined' ? PIXI : undefined);
    if (this.app?.stage) this.app.stage.sortableChildren = true;
  }

  createElement(config: ElementConfig): RenderElement {
    let node: any;
    const P = this.pixi;
    if (config.type === 'image') {
      const texture = P.Texture.from(config.src || '');
      const sprite = new P.Sprite(texture);
      node = sprite;
    } else if (config.type === 'nine-slice') {
      const texture = P.Texture.from(config.src || '');
      const s = (config as any).slice || { left: 12, top: 12, right: 12, bottom: 12 };
      const plane = new P.NineSlicePlane(texture, Number(s.left||12), Number(s.top||12), Number(s.right||12), Number(s.bottom||12));
      node = plane;
    } else if (config.type === 'text') {
      const rawStyle: any = config.style || {};
      // Map style fields
      const fill = (rawStyle.fill || rawStyle.color) || '#ffffff';
      const fontSize = rawStyle.fontSize ? parseInt(String(rawStyle.fontSize)) : 16;
      const lineHeight = rawStyle.lineHeight ? parseInt(String(rawStyle.lineHeight)) : Math.round(fontSize * 1.3);
      // compute wrap width: prefer explicit maxWidth, else canvas width minus padding
      const rendererWidth = this.app?.renderer?.width || 800;
      let wrapWidth: number | undefined;
      if (rawStyle.maxWidth != null) {
        const v = String(rawStyle.maxWidth);
        wrapWidth = v.endsWith('px') ? parseInt(v) : Number(v);
      } else if (rawStyle.wordWrapWidth != null) {
        wrapWidth = Number(rawStyle.wordWrapWidth);
      } else {
        wrapWidth = undefined; // do not force wrap width; keep by content/default
      }
      const safeColor = (v: any, fallback: any) => (typeof v === 'string' || typeof v === 'number') ? v : fallback;
      const textStyle: any = {
        fill: safeColor(fill, '#ffffff'),
        fontSize,
        wordWrap: wrapWidth != null,
        wordWrapWidth: wrapWidth,
        align: rawStyle.textAlign || rawStyle.align || 'left',
        lineHeight,
      fontFamily: rawStyle.fontFamily || rawStyle.font || 'Arial, Helvetica, sans-serif',
      dropShadow: rawStyle.dropShadow === true,
      };
      // For Pixi v6 compatibility, provide leading
      (textStyle as any).leading = Math.max(0, lineHeight - fontSize);
      // only include stroke when provided
      const strokeVal = rawStyle.stroke || rawStyle.strokeColor;
      if (strokeVal != null && strokeVal !== 'none') {
        textStyle.stroke = safeColor(strokeVal, '#000000');
        textStyle.strokeThickness = rawStyle.strokeThickness != null ? parseInt(String(rawStyle.strokeThickness)) : 2;
      } else {
        textStyle.strokeThickness = 0;
      }
      // only include shadow color when enabled
      if (textStyle.dropShadow) {
        textStyle.dropShadowColor = safeColor(rawStyle.dropShadowColor, 0x000000);
        if (rawStyle.dropShadowBlur != null) textStyle.dropShadowBlur = parseInt(String(rawStyle.dropShadowBlur));
        if (rawStyle.dropShadowAngle != null) textStyle.dropShadowAngle = Number(rawStyle.dropShadowAngle);
        if (rawStyle.dropShadowDistance != null) textStyle.dropShadowDistance = Number(rawStyle.dropShadowDistance);
      }
      const text = new P.Text(config.content || '', textStyle);
      node = text;
    } else {
      // fallback container
      node = new P.Container();
    }

    node.x = config.position?.x || 0;
    node.y = config.position?.y || 0;
    if (config.size && node.width !== undefined && node.height !== undefined) {
      const w = Math.round(config.size.width || 0);
      const h = Math.round(config.size.height || 0);
      node.width = w > 0 ? w : config.size.width;
      node.height = h > 0 ? h : config.size.height;
    }
    node.visible = config.visible !== false;
    if (config.style?.zIndex != null) node.zIndex = config.style.zIndex;
    // optional anchor centering for sprites
    try {
      if ((node as any).anchor && config.style && (config.style as any).anchorCenter) {
        (node as any).anchor.set(0.5);
      }
    } catch {}
    // Parent support: add to parent if provided
    const parentNode = config.parentId ? this.elements.get(config.parentId) : null;
    if (parentNode && parentNode.addChild) {
      parentNode.addChild(node);
    } else {
      this.app.stage.addChild(node);
    }
    this.elements.set(config.id, node);

    const self = this;
    return {
      id: config.id,
      type: config.type,
      position: config.position || { x: 0, y: 0 },
      size: config.size || { width: node.width || 0, height: node.height || 0 },
      rotation: node.rotation || 0,
      scale: node.scale || { x: 1, y: 1 },
      visible: node.visible,
      interactive: !!node.interactive,
      update(updates: Partial<ElementConfig>): void {
        self.updateElement(config.id, updates);
      },
      destroy(): void {
        self.removeElement(config.id);
      }
    };
  }

  updateElement(id: string, updates: Partial<ElementConfig>): void {
    const node = this.elements.get(id);
    if (!node) return;
    if (updates.position) { node.x = updates.position.x ?? node.x; node.y = updates.position.y ?? node.y; }
    if (updates.size && node.width !== undefined) {
      const w = updates.size.width != null ? Math.round(updates.size.width) : undefined;
      const h = updates.size.height != null ? Math.round(updates.size.height) : undefined;
      node.width = w ?? node.width; node.height = h ?? node.height;
    }
    if (updates.visible != null) node.visible = updates.visible;
    if (updates.rotation != null) node.rotation = updates.rotation;
    if (updates.scale && node.scale) { node.scale.x = updates.scale.x ?? node.scale.x; node.scale.y = updates.scale.y ?? node.scale.y; }
    if (updates.type === 'text' && (updates as any).content !== undefined) { node.text = (updates as any).content; }
    if (updates.style && node.style) {
      const st: any = updates.style;
      if (st.fill || st.color) node.style.fill = (st.fill || st.color);
      if (st.fontSize) node.style.fontSize = parseInt(String(st.fontSize));
      if (st.maxWidth || st.padding) {
        const rendererWidth = this.app?.renderer?.width || 800;
        const pad = st.padding ? parseInt(String(st.padding)) : 40;
        const wrapWidth = st.maxWidth ? (String(st.maxWidth).endsWith('px') ? parseInt(String(st.maxWidth)) : Number(st.maxWidth)) : Math.max(100, rendererWidth - pad * 2);
        node.style.wordWrap = true;
        node.style.wordWrapWidth = wrapWidth;
      }
      if (st.textAlign || st.align) node.style.align = st.textAlign || st.align;
      if (st.lineHeight) node.style.lineHeight = parseInt(String(st.lineHeight));
      if (st.fontFamily || st.font) node.style.fontFamily = st.fontFamily || st.font;
      if (st.stroke || st.strokeColor || st.strokeThickness != null) {
        if (st.stroke || st.strokeColor) node.style.stroke = st.stroke || st.strokeColor;
        if (st.strokeThickness != null) node.style.strokeThickness = parseInt(String(st.strokeThickness));
      }
      if (st.dropShadow != null) node.style.dropShadow = !!st.dropShadow;
      if (st.dropShadowColor) node.style.dropShadowColor = st.dropShadowColor;
      if (st.dropShadowBlur != null) node.style.dropShadowBlur = parseInt(String(st.dropShadowBlur));
      if (st.dropShadowAngle != null) node.style.dropShadowAngle = Number(st.dropShadowAngle);
      if (st.dropShadowDistance != null) node.style.dropShadowDistance = Number(st.dropShadowDistance);
    }
  }

  removeElement(id: string): void {
    const node = this.elements.get(id);
    if (!node) return;
    try { this.app.stage.removeChild(node); node.destroy?.({ children: true, texture: false, baseTexture: false }); } catch {}
    this.elements.delete(id);
  }

  render(): void {
    // Pixi auto-renders each frame via ticker. No-op.
  }

  // Pixi-specific helpers for handlers
  getNode(id: string): any | undefined {
    return this.elements.get(id);
  }

  // Expose Pixi app/stage for custom effects
  getApp(): any { return this.app; }
  getStage(): any { return this.app?.stage; }
  getPixi(): any { return this.pixi; }

  addDropZone(id: string, rect: { x: number; y: number; w: number; h: number; accept?: string[] }) {
    this.dropZones.set(id, rect);
  }

  getDropZones(): Array<{ id: string; x: number; y: number; w: number; h: number; accept?: string[] }> {
    return Array.from(this.dropZones.entries()).map(([id, r]) => ({ id, ...r }));
  }
}
