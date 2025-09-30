// Minimal Pixi-based IRendererManager implementation for browser
import { IRendererManager, ElementConfig, RenderElement } from '../types';
import { RenderElementNode } from './rendering/RenderElementNode';

declare const PIXI: any;

export class PixiRendererManager implements IRendererManager {
  private app: any;
  private elements = new Map<string, RenderElementNode>();
  private dropZones = new Map<string, { x: number; y: number; w: number; h: number; accept?: string[] }>();
  private pixi: any;
  public animationAdapter: any;
  // Exclusive interaction guard: when set, only this element remains interactive
  private exclusiveInteractiveId: string | null = null;
  private savedInteraction = new Map<string, { mode?: any; interactive?: boolean; interactiveChildren?: boolean; hitArea?: any }>();
  private tickerFn: ((delta: number) => void) | null = null;

  constructor(app: any, pixiRef?: any) {
    this.app = app;
    this.pixi = pixiRef || (typeof PIXI !== 'undefined' ? PIXI : undefined);
    if (this.app?.stage) this.app.stage.sortableChildren = true;
    // Provide a simple animation adapter for commands like MOVE_TO
    const self = this;
    this.animationAdapter = {
      moveTo(cfg: { from: { x: number; y: number }; to: { x: number; y: number }; duration: number; onUpdate?: (t:number, cur:{x:number;y:number})=>void; onComplete?:()=>void; elementId?: string }) {
        const start = Date.now();
        const dur = Math.max(0, Number(cfg.duration) || 0);
        const id = `move_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        const ticker = self.app?.ticker;
        const step = () => {
          const t = dur === 0 ? 1 : Math.min(1, (Date.now() - start) / dur);
          const x = cfg.from.x + (cfg.to.x - cfg.from.x) * t;
          const y = cfg.from.y + (cfg.to.y - cfg.from.y) * t;
          try { cfg.onUpdate && cfg.onUpdate(t, { x, y }); } catch {}
          if (t >= 1) {
            try { cfg.onComplete && cfg.onComplete(); } catch {}
            if (ticker) ticker.remove(step);
          }
        };
        if (ticker) { ticker.add(step); } else { const raf = () => { step(); if ((Date.now() - start) < dur) requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
        return Promise.resolve(id);
      }
    };

    if (this.app?.ticker) {
      this.tickerFn = () => {
        const deltaMS = this.app?.ticker?.deltaMS ?? 16.67;
        for (const node of this.elements.values()) {
          try { node.update(deltaMS); } catch {}
        }
      };
      this.app.ticker.add(this.tickerFn);
    }
  }


  createElement(config: ElementConfig): RenderElement {
    const P = this.pixi;
    const type = config.type || 'image';
    const style: any = config.style || {};
    let visual: any;

    if (type === 'image') {
      const texture = P.Texture.from(config.src || '');
      const sprite = new P.Sprite(texture);
      try { (sprite as any).resourceId = (config as any).resourceId || (sprite as any).resourceId; } catch {}
      visual = sprite;
    } else if (type === 'nine-slice') {
      const texture = P.Texture.from(config.src || '');
      const s = (config as any).slice || { left: 12, top: 12, right: 12, bottom: 12 };
      visual = new P.NineSlicePlane(texture, Number(s.left || 12), Number(s.top || 12), Number(s.right || 12), Number(s.bottom || 12));
    } else if (type === 'text') {
      const rawStyle: any = config.style || {};
      const fill = (rawStyle.fill || rawStyle.color) || '#ffffff';
      const fontSize = rawStyle.fontSize ? parseInt(String(rawStyle.fontSize)) : 16;
      const lineHeight = rawStyle.lineHeight ? parseInt(String(rawStyle.lineHeight)) : Math.round(fontSize * 1.3);
      const rendererWidth = this.app?.renderer?.width || 800;
      let wrapWidth: number | undefined;
      if (rawStyle.maxWidth != null) {
        const v = String(rawStyle.maxWidth);
        wrapWidth = v.endsWith('px') ? parseInt(v) : Number(v);
      } else if (rawStyle.wordWrapWidth != null) {
        wrapWidth = Number(rawStyle.wordWrapWidth);
      } else {
        wrapWidth = undefined;
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
        fontWeight: rawStyle.fontWeight || rawStyle.bold === true ? 'bold' : (rawStyle.fontWeight || 'normal'),
      };
      (textStyle as any).leading = Math.max(0, lineHeight - fontSize);
      const strokeVal = rawStyle.stroke || rawStyle.strokeColor;
      if (strokeVal != null && strokeVal !== 'none') {
        textStyle.stroke = safeColor(strokeVal, '#000000');
        textStyle.strokeThickness = rawStyle.strokeThickness != null ? parseInt(String(rawStyle.strokeThickness)) : 2;
      } else {
        textStyle.strokeThickness = 0;
      }
      if (textStyle.dropShadow) {
        textStyle.dropShadowColor = safeColor(rawStyle.dropShadowColor, 0x000000);
        if (rawStyle.dropShadowBlur != null) textStyle.dropShadowBlur = parseInt(String(rawStyle.dropShadowBlur));
        if (rawStyle.dropShadowAngle != null) textStyle.dropShadowAngle = Number(rawStyle.dropShadowAngle);
        if (rawStyle.dropShadowDistance != null) textStyle.dropShadowDistance = Number(rawStyle.dropShadowDistance);
      }
      const hasMarkup = (s: any) => {
        try { const t = String(s || ''); return /<\/?(b|color|c|span|br)/i.test(t); } catch { return false; }
      };
      const parseColorVal = (raw: string | undefined): any => {
        if (!raw) return undefined;
        const s = String(raw).trim();
        if (s.startsWith('#')) {
          const hex = s.length === 4 ? ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]) : s;
          return parseInt('0x' + hex.slice(1));
        }
        if (/^0x/i.test(s)) { try { return parseInt(s); } catch { return s; } }
        return s;
      };
      const buildRichText = (content: string, baseStyle: any): any => {
        const cont = new P.Container();
        (cont as any).__isRichText = true;
        (cont as any).__richBaseStyle = { ...baseStyle };
        (cont as any).__wrapWidth = wrapWidth;
        (cont as any).__rawText = content;
        const tokens: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
        const stack: Array<{ bold?: boolean; color?: any }> = [];
        const cur = () => ({ bold: stack.some(s => s.bold), color: (() => { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) return stack[i].color; } return undefined; })() });
        const pushText = (s: string) => { if (!s) return; tokens.push({ t: 'text', text: s, style: cur() }); };
        const src = String(content || '');
        const re = /<\/?(b|color|c|span|br)([^>]*)>/ig;
        let last = 0; let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          if (m.index > last) pushText(src.slice(last, m.index));
          const closing = src[m.index + 1] === '/';
          const tag = m[1].toLowerCase();
          const attrs = m[2] || '';
          if (tag === 'br' && !closing) { tokens.push({ t: 'br' }); last = re.lastIndex; continue; }
          if (!closing) {
            if (tag === 'b') stack.push({ bold: true });
            else if (tag === 'color' || tag === 'c') {
              const m1 = attrs.match(/=\s*(['"]?)(#[0-9a-fA-F]{3,8}|0x[0-9a-fA-F]+|[a-zA-Z]+)/);
              const col = parseColorVal(m1 ? m1[2] : undefined);
              stack.push({ color: col });
            } else if (tag === 'span') {
              let col: any;
              const m2 = attrs.match(/color\s*=\s*['"]([^'"]+)['"]/i);
              if (m2) col = parseColorVal(m2[1]);
              const m3 = attrs.match(/style\s*=\s*['"][^'"]*color\s*:\s*([^;'"]+)/i);
              if (!col && m3) col = parseColorVal(m3[1]);
              stack.push({ color: col });
            }
          } else {
            if (tag === 'b') {
              for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].bold) { stack.splice(i, 1); break; } }
            } else {
              for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) { stack.splice(i, 1); break; } }
            }
          }
          last = re.lastIndex;
        }
        if (last < src.length) pushText(src.slice(last));
        const expanded: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
        tokens.forEach(tok => {
          if (tok.t === 'br') { expanded.push(tok); return; }
          const parts = String(tok.text || '').split(/
/);
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) expanded.push({ t: 'br' });
            if (parts[i]) expanded.push({ t: 'text', text: parts[i], style: tok.style });
          }
        });
        let x = 0, y = 0, lineH = Math.ceil(baseStyle.lineHeight || baseStyle.fontSize || 16);
        const align = String(baseStyle.align || 'left');
        const lines: Array<Array<any>> = [[]];
        expanded.forEach(tok => {
          if (tok.t === 'br') { lines.push([]); return; }
          const st = { ...baseStyle };
          if (tok.style?.bold) st.fontWeight = 'bold';
          if (tok.style?.color != null) st.fill = tok.style.color;
          const t = new P.Text(tok.text || '', st);
          (t as any).__segment = true;
          lines[lines.length - 1].push(t);
        });
        y = 0;
        lines.forEach((arr) => {
          x = 0; lineH = 0;
          let lineW = 0; arr.forEach((t: any) => { lineW += Math.ceil(t.width); lineH = Math.max(lineH, Math.ceil(t.height)); });
          let startX = 0;
          if (align === 'center' && wrapWidth != null) startX = Math.max(0, Math.round((wrapWidth - lineW) / 2));
          else if (align === 'right' && wrapWidth != null) startX = Math.max(0, Math.round((wrapWidth - lineW)));
          x = startX;
          arr.forEach((t: any) => { t.x = x; t.y = y; cont.addChild(t); x += Math.ceil(t.width); });
          y += (lineH > 0 ? lineH : (baseStyle.lineHeight || baseStyle.fontSize || 16));
        });
        return cont;
      };
      const contentText = String((config as any).content || '');
      if (hasMarkup(contentText)) {
        visual = buildRichText(contentText, textStyle);
      } else {
        const textNode = new P.Text(contentText, textStyle);
        (textNode as any).__rawText = contentText;
        visual = textNode;
      }
    } else {
      visual = new P.Container();
    }

    const node = new RenderElementNode(P, type, visual, { id: config.id });
    const wrapper = node.wrapper;

    if ((config as any).resourceId) {
      try { (wrapper as any).resourceId = (config as any).resourceId; } catch {}
      try { if (visual) (visual as any).resourceId = (config as any).resourceId; } catch {}
    }

    wrapper.visible = config.visible !== false;
    if (style?.zIndex != null) wrapper.zIndex = Number(style.zIndex);

    if (style?.anchorCenter) node.setAnchor(undefined, undefined, true);
    else node.setAnchor(style?.anchorX, style?.anchorY, false);

    const pos = config.position || { x: 0, y: 0 };
    node.setBasePosition(pos.x ?? 0, pos.y ?? 0);

    const scaleCfg: any = (config as any).scale ?? config.scale;
    if (scaleCfg != null) {
      if (typeof scaleCfg === 'number') node.setBaseScale({ x: scaleCfg, y: scaleCfg });
      else node.setBaseScale(scaleCfg);
    }

    if (config.rotation != null) node.setBaseRotation(config.rotation);
    node.setVisible(config.visible !== false);

    if (config.size) {
      node.setSize((config.size as any).width, (config.size as any).height);
    }

    const parentNode = config.parentId ? this.elements.get(config.parentId) : null;
    if (parentNode) {
      node.attachTo(parentNode);
    } else {
      this.app.stage.addChild(wrapper);
    }

    this.elements.set(config.id, node);
    node.update(0);

    if (this.exclusiveInteractiveId && this.exclusiveInteractiveId !== config.id) {
      try {
        if (!this.savedInteraction.has(config.id)) {
          this.savedInteraction.set(config.id, {
            mode: (wrapper as any).eventMode,
            interactive: (wrapper as any).interactive,
            interactiveChildren: (wrapper as any).interactiveChildren,
            hitArea: (wrapper as any).hitArea
          });
        }
        if ('eventMode' in (wrapper as any)) (wrapper as any).eventMode = 'none';
        if ('interactive' in (wrapper as any)) (wrapper as any).interactive = false;
        if ('interactiveChildren' in (wrapper as any)) (wrapper as any).interactiveChildren = false;
        if ('hitArea' in (wrapper as any)) (wrapper as any).hitArea = null;
      } catch {}
    }

    const base = node.getBaseSnapshot();
    const rendered = node.getRenderedTransform();
    const self = this;
    return {
      id: config.id,
      type: config.type,
      position: { x: base.x, y: base.y },
      size: { width: rendered.width, height: rendered.height },
      rotation: base.rotation,
      scale: { x: base.scaleX, y: base.scaleY },
      visible: base.visible,
      interactive: !!(wrapper as any).interactive,
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
    const wrapper: any = node.wrapper;
    const content: any = node.content;

    if (updates.style) {
      const st: any = updates.style;
      if (st.anchorCenter || st.anchorX != null || st.anchorY != null) {
        node.setAnchor(st.anchorX, st.anchorY, !!st.anchorCenter);
      }
      if (st.zIndex != null) {
        try { wrapper.zIndex = Number(st.zIndex); wrapper.parent?.sortChildren?.(); } catch {}
      }
    }

    if (updates.position) {
      node.setBasePosition(updates.position.x, updates.position.y);
    }
    if (updates.size) {
      node.setSize((updates.size as any).width, (updates.size as any).height);
    }
    if (updates.visible != null) {
      node.setVisible(!!updates.visible);
    }
    if (updates.rotation != null) {
      node.setBaseRotation(updates.rotation);
    }
    if (updates.scale) {
      node.setBaseScale(updates.scale);
    }

    if ((updates as any).content !== undefined && updates.type === 'text') {
      const contentText = (updates as any).content;
      if (content && (content as any).__isRichText) {
        try {
          const base = (content as any).__richBaseStyle || {};
          const wrapWidth = (content as any).__wrapWidth;
          const P = this.pixi;
          while (content.children?.length) { try { content.removeChild(content.children[content.children.length - 1]); } catch {} }
          const builder = (textSrc: string, baseStyle: any) => {
            const hasMarkup = (s: any) => { try { const t = String(s || ''); return /<\/?(b|color|c|span|br)/i.test(t); } catch { return false; } };
            const parseColorVal = (raw: string | undefined): any => {
              if (!raw) return undefined;
              const s = String(raw).trim();
              if (s.startsWith('#')) { const hex = s.length === 4 ? ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]) : s; return parseInt('0x' + hex.slice(1)); }
              if (/^0x/i.test(s)) { try { return parseInt(s); } catch { return s; } }
              return s;
            };
            const tokens: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
            const stack: Array<{ bold?: boolean; color?: any }> = [];
            const cur = () => ({ bold: stack.some(s => s.bold), color: (() => { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) return stack[i].color; } return undefined; })() });
            const pushText = (s: string) => { if (!s) return; tokens.push({ t: 'text', text: s, style: cur() }); };
            const src = String(textSrc || '');
            const re = /<\/?(b|color|c|span|br)([^>]*)>/ig;
            let last = 0; let m: RegExpExecArray | null;
            while ((m = re.exec(src))) {
              if (m.index > last) pushText(src.slice(last, m.index));
              const closing = src[m.index + 1] === '/';
              const tag = m[1].toLowerCase();
              const attrs = m[2] || '';
              if (tag === 'br' && !closing) { tokens.push({ t: 'br' }); last = re.lastIndex; continue; }
              if (!closing) {
                if (tag === 'b') stack.push({ bold: true });
                else if (tag === 'color' || tag === 'c') {
                  const m1 = attrs.match(/=\s*(['"]?)(#[0-9a-fA-F]{3,8}|0x[0-9a-fA-F]+|[a-zA-Z]+)/);
                  const col = parseColorVal(m1 ? m1[2] : undefined);
                  stack.push({ color: col });
                } else if (tag === 'span') {
                  let col: any;
                  const m2 = attrs.match(/color\s*=\s*['"]([^'"]+)['"]/i);
                  if (m2) col = parseColorVal(m2[1]);
                  const m3 = attrs.match(/style\s*=\s*['"][^'"]*color\s*:\s*([^;'"]+)/i);
                  if (!col && m3) col = parseColorVal(m3[1]);
                  stack.push({ color: col });
                }
              } else {
                if (tag === 'b') {
                  for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].bold) { stack.splice(i, 1); break; } }
                } else {
                  for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) { stack.splice(i, 1); break; } }
                }
              }
              last = re.lastIndex;
            }
            if (last < src.length) pushText(src.slice(last));
            const expanded: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
            tokens.forEach(tok => {
              if (tok.t === 'br') { expanded.push(tok); return; }
              const parts = String(tok.text || '').split(/
/);
              for (let i = 0; i < parts.length; i++) {
                if (i > 0) expanded.push({ t: 'br' });
                if (parts[i]) expanded.push({ t: 'text', text: parts[i], style: tok.style });
              }
            });
            let x = 0, y = 0, lineH = Math.ceil(baseStyle.lineHeight || baseStyle.fontSize || 16);
            const align = String(baseStyle.align || 'left');
            const lines: Array<Array<any>> = [[]];
            expanded.forEach(tok => {
              if (tok.t === 'br') { lines.push([]); return; }
              const st = { ...baseStyle };
              if (tok.style?.bold) st.fontWeight = 'bold';
              if (tok.style?.color != null) st.fill = tok.style.color;
              const t = new P.Text(tok.text || '', st);
              (t as any).__segment = true;
              lines[lines.length - 1].push(t);
            });
            y = 0;
            lines.forEach((arr) => {
              x = 0; lineH = 0;
              let lineW = 0; arr.forEach((t: any) => { lineW += Math.ceil(t.width); lineH = Math.max(lineH, Math.ceil(t.height)); });
              let startX = 0;
              if (align === 'center' && wrapWidth != null) startX = Math.max(0, Math.round((wrapWidth - lineW) / 2));
              else if (align === 'right' && wrapWidth != null) startX = Math.max(0, Math.round((wrapWidth - lineW)));
              x = startX;
              arr.forEach((t: any) => { t.x = x; t.y = y; content.addChild(t); x += Math.ceil(t.width); });
              y += (lineH > 0 ? lineH : (baseStyle.lineHeight || baseStyle.fontSize || 16));
            });
          };
          (content as any).__rawText = contentText;
          builder(String(contentText ?? ''), base);
        } catch {}
      } else if (content && typeof content.text === 'string') {
        content.text = contentText;
      }
    }

    if (updates.style && content?.style) {
      const st: any = updates.style;
      if (st.fill || st.color) content.style.fill = st.fill || st.color;
      if (st.fontSize) content.style.fontSize = parseInt(String(st.fontSize));
      if (st.maxWidth || st.padding) {
        const rendererWidth = this.app?.renderer?.width || 800;
        const pad = st.padding ? parseInt(String(st.padding)) : 40;
        const wrapWidth = st.maxWidth ? (String(st.maxWidth).endsWith('px') ? parseInt(String(st.maxWidth)) : Number(st.maxWidth)) : Math.max(100, rendererWidth - pad * 2);
        content.style.wordWrap = true;
        content.style.wordWrapWidth = wrapWidth;
      }
      if (st.textAlign || st.align) content.style.align = st.textAlign || st.align;
      if (st.lineHeight) content.style.lineHeight = parseInt(String(st.lineHeight));
      if (st.fontFamily || st.font) content.style.fontFamily = st.fontFamily || st.font;
      if (st.stroke || st.strokeColor || st.strokeThickness != null) {
        if (st.stroke || st.strokeColor) content.style.stroke = st.stroke || st.strokeColor;
        if (st.strokeThickness != null) content.style.strokeThickness = parseInt(String(st.strokeThickness));
      }
      if (st.dropShadow != null) content.style.dropShadow = !!st.dropShadow;
      if (st.dropShadowColor) content.style.dropShadowColor = st.dropShadowColor;
      if (st.dropShadowBlur != null) content.style.dropShadowBlur = parseInt(String(st.dropShadowBlur));
      if (st.dropShadowAngle != null) content.style.dropShadowAngle = Number(st.dropShadowAngle);
      if (st.dropShadowDistance != null) content.style.dropShadowDistance = Number(st.dropShadowDistance);
    }

    if (updates.style && (content as any).__isRichText) {
      try {
        const base = (content as any).__richBaseStyle || {};
        const next = { ...base };
        const st: any = updates.style;
        if (st.fill || st.color) next.fill = st.fill || st.color;
        if (st.fontSize) next.fontSize = parseInt(String(st.fontSize));
        if (st.textAlign || st.align) next.align = st.textAlign || st.align;
        if (st.lineHeight) next.lineHeight = parseInt(String(st.lineHeight));
        if (st.fontFamily || st.font) next.fontFamily = st.fontFamily || st.font;
        if (st.stroke || st.strokeColor || st.strokeThickness != null) {
          if (st.stroke || st.strokeColor) next.stroke = st.stroke || st.strokeColor;
          if (st.strokeThickness != null) next.strokeThickness = parseInt(String(st.strokeThickness));
        }
        if (st.dropShadow != null) next.dropShadow = !!st.dropShadow;
        if (st.dropShadowColor) next.dropShadowColor = st.dropShadowColor;
        if (st.dropShadowBlur != null) next.dropShadowBlur = parseInt(String(st.dropShadowBlur));
        if (st.dropShadowAngle != null) next.dropShadowAngle = Number(st.dropShadowAngle);
        if (st.dropShadowDistance != null) next.dropShadowDistance = Number(st.dropShadowDistance);
        (content as any).__richBaseStyle = next;
        const raw = (content as any).__rawText;
        if (raw != null) {
          this.updateElement(id, { type: 'text', content: raw } as any);
          return;
        }
      } catch {}
    }

    node.update(0);
  }

  removeElement(id: string): void {
    const node = this.elements.get(id);
    if (!node) return;
    const wrapper: any = node.wrapper;
    if (this.exclusiveInteractiveId === id) {
      try { this.clearExclusiveInteractive(id); } catch {}
    }
    try {
      if (wrapper?.parent) wrapper.parent.removeChild(wrapper);
      node.attachTo(null);
    } catch {}
    try { node.destroy(); } catch {}
    this.elements.delete(id);
  }
  render(): void {
    // Pixi auto-renders each frame via ticker. No-op.
  }

  // Pixi-specific helpers for handlers
  getNode(id: string): any | undefined {
    return this.elements.get(id)?.wrapper;
  }
  // Alias for generic handlers
  getElement(id: string): any | undefined { return this.getNode(id); }

  // Clear stage and internal registries when switching levels/scenes

  clearAll(): void {
    try {
      for (const [id, node] of this.elements.entries()) {
        const wrapper: any = node.wrapper;
        try {
          const watchers = (wrapper as any).__checkAreaWatchers as Map<string, any> | undefined;
          if (watchers && this.app?.ticker) {
            watchers.forEach((w: any) => { try { this.app.ticker.remove(w.fn); } catch {} });
          }
        } catch {}
        try {
          const dh = (wrapper as any).__dragHandlers;
          if (dh?.winUp) { window.removeEventListener('pointerup', dh.winUp as any); }
        } catch {}
        try { wrapper.parent?.removeChild(wrapper); } catch {}
        try { node.destroy(); } catch {}
      }
    } catch {}
    try { this.app.stage.removeChildren(); } catch {}
    this.elements.clear();
    this.dropZones.clear();
    try {
      const st: any = this.getStage?.();
      st?.removeAllListeners?.('pointermove');
      st?.removeAllListeners?.('pointerup');
      st?.removeAllListeners?.('pointerupoutside');
    } catch {}
    try { (this.app?.renderer as any)?.textureGC?.run?.(); } catch {}
    try {
      const utils: any = this.pixi?.utils;
      const BT = utils?.BaseTextureCache || {};
      const TC = utils?.TextureCache || {};
      for (const k in BT) { try { BT[k]?.destroy?.(true); } catch {} delete (BT as any)[k]; }
      for (const k in TC) { try { TC[k]?.destroy?.(true); } catch {} delete (TC as any)[k]; }
    } catch {}
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

  // Make only the specified element interactive; disable all others (pointer-wise)
  setExclusiveInteractive(id: string | null): void {
    if (!id) { this.clearExclusiveInteractive(); return; }
    // No-op if already exclusive to the same id
    if (this.exclusiveInteractiveId === id) return;
    this.exclusiveInteractiveId = id;
    // disable all others, preserve their states
    for (const [eid, node] of this.elements.entries()) {
      if (eid === id) continue;
      const wrapper: any = node.wrapper;
      try {
        if (!this.savedInteraction.has(eid)) {
          this.savedInteraction.set(eid, {
            mode: wrapper?.eventMode,
            interactive: wrapper?.interactive,
            interactiveChildren: wrapper?.interactiveChildren,
            hitArea: wrapper?.hitArea
          });
        }
        if (wrapper && 'eventMode' in wrapper) wrapper.eventMode = 'none';
        if (wrapper && 'interactive' in wrapper) wrapper.interactive = false;
        if (wrapper && 'interactiveChildren' in wrapper) wrapper.interactiveChildren = false;
        if (wrapper && 'hitArea' in wrapper) wrapper.hitArea = null;
      } catch {}
    }
  }

  // Clear exclusive interaction if matches current; restores saved states
  clearExclusiveInteractive(idIfKnown?: string): void {
    if (idIfKnown && this.exclusiveInteractiveId && idIfKnown !== this.exclusiveInteractiveId) return;
    this.exclusiveInteractiveId = null;
    // restore
    for (const [eid, saved] of this.savedInteraction.entries()) {
      const node = this.elements.get(eid);
      if (!node) { this.savedInteraction.delete(eid); continue; }
      const wrapper: any = node.wrapper;
      try {
        if (wrapper && 'eventMode' in wrapper) wrapper.eventMode = saved.mode ?? wrapper.eventMode;
        if (wrapper && 'interactive' in wrapper) wrapper.interactive = saved.interactive ?? wrapper.interactive;
        if (wrapper && 'interactiveChildren' in wrapper) wrapper.interactiveChildren = saved.interactiveChildren ?? wrapper.interactiveChildren;
        if (wrapper && 'hitArea' in wrapper) wrapper.hitArea = saved.hitArea ?? wrapper.hitArea;
      } catch {}
    }
    this.savedInteraction.clear();
  }
}
