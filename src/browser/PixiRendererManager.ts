// Minimal Pixi-based IRendererManager implementation for browser
import { IRendererManager, ElementConfig, RenderElement } from '../types';

declare const PIXI: any;

export class PixiRendererManager implements IRendererManager {
  private app: any;
  private elements = new Map<string, any>();
  private dropZones = new Map<string, { x: number; y: number; w: number; h: number; accept?: string[] }>();

  constructor(app: any) {
    this.app = app;
    if (this.app?.stage) this.app.stage.sortableChildren = true;
  }

  createElement(config: ElementConfig): RenderElement {
    let node: any;
    if (config.type === 'image') {
      const texture = PIXI.Texture.from(config.src || '');
      const sprite = new PIXI.Sprite(texture);
      node = sprite;
    } else if (config.type === 'text') {
      const rawStyle: any = config.style || {};
      // Map style fields
      const fill = rawStyle.color || '#ffffff';
      const fontSize = rawStyle.fontSize ? parseInt(String(rawStyle.fontSize)) : 16;
      // compute wrap width: prefer explicit maxWidth, else canvas width minus padding
      const rendererWidth = this.app?.renderer?.width || 800;
      let wrapWidth: number | undefined;
      if (rawStyle.maxWidth) {
        const v = String(rawStyle.maxWidth);
        wrapWidth = v.endsWith('px') ? parseInt(v) : Number(v);
      } else {
        const pad = rawStyle.padding ? parseInt(String(rawStyle.padding)) : 40;
        wrapWidth = Math.max(100, rendererWidth - pad * 2);
      }
      const textStyle: any = {
        fill,
        fontSize,
        wordWrap: true,
        wordWrapWidth: wrapWidth,
        align: rawStyle.textAlign || rawStyle.align || 'left',
        lineHeight: rawStyle.lineHeight ? parseInt(String(rawStyle.lineHeight)) : undefined,
      };
      const text = new PIXI.Text(config.content || '', textStyle);
      node = text;
    } else {
      // fallback container
      node = new PIXI.Container();
    }

    node.x = config.position?.x || 0;
    node.y = config.position?.y || 0;
    if (config.size && node.width !== undefined && node.height !== undefined) {
      node.width = config.size.width;
      node.height = config.size.height;
    }
    node.visible = config.visible !== false;
    if (config.style?.zIndex != null) node.zIndex = config.style.zIndex;
    this.app.stage.addChild(node);
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
    if (updates.size && node.width !== undefined) { node.width = updates.size.width ?? node.width; node.height = updates.size.height ?? node.height; }
    if (updates.visible != null) node.visible = updates.visible;
    if (updates.rotation != null) node.rotation = updates.rotation;
    if (updates.scale && node.scale) { node.scale.x = updates.scale.x ?? node.scale.x; node.scale.y = updates.scale.y ?? node.scale.y; }
    if (updates.type === 'text' && (updates as any).content !== undefined) { node.text = (updates as any).content; }
    if (updates.style && node.style) {
      const st: any = updates.style;
      if (st.color) node.style.fill = st.color;
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

  addDropZone(id: string, rect: { x: number; y: number; w: number; h: number; accept?: string[] }) {
    this.dropZones.set(id, rect);
  }

  getDropZones(): Array<{ id: string; x: number; y: number; w: number; h: number; accept?: string[] }> {
    return Array.from(this.dropZones.entries()).map(([id, r]) => ({ id, ...r }));
  }
}
