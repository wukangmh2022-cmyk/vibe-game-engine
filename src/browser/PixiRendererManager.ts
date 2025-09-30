// Minimal Pixi-based IRendererManager implementation for browser
import { IRendererManager, ElementConfig, RenderElement } from '../types';

declare const PIXI: any;

export class PixiRendererManager implements IRendererManager {
  private app: any;
  private elements = new Map<string, any>();
  private dropZones = new Map<string, { x: number; y: number; w: number; h: number; accept?: string[] }>();
  private pixi: any;
  public animationAdapter: any;
  // Exclusive interaction guard: when set, only this element remains interactive
  private exclusiveInteractiveId: string | null = null;
  private savedInteraction = new Map<string, { mode?: any; interactive?: boolean; interactiveChildren?: boolean; hitArea?: any }>();

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
  }

  createElement(config: ElementConfig): RenderElement {
    let node: any;
    const P = this.pixi;
    if (config.type === 'image') {
      const texture = P.Texture.from(config.src || '');
      const sprite = new P.Sprite(texture);
      try { (sprite as any).resourceId = (config as any).resourceId || (sprite as any).resourceId; } catch {}
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
        fontWeight: rawStyle.fontWeight || rawStyle.bold === true ? 'bold' : (rawStyle.fontWeight || 'normal'),
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
      const hasMarkup = (s: any) => {
        try { const t = String(s || ''); return /<\/?(b|color|c|span|br)\b/i.test(t); } catch { return false; }
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
              const m1 = attrs.match(/=\s*(['"]?)(#[0-9a-fA-F]{3,8}|0x[0-9a-fA-F]+|[a-zA-Z]+)\1/);
              const col = parseColorVal(m1 ? m1[2] : undefined);
              stack.push({ color: col });
            } else if (tag === 'span') {
              let col: any;
              const m2 = attrs.match(/\bcolor\s*=\s*['"]([^'\"]+)['"]/i);
              if (m2) col = parseColorVal(m2[1]);
              const m3 = attrs.match(/style\s*=\s*['"][^'\"]*color\s*:\s*([^;'\"]+)/i);
              if (!col && m3) col = parseColorVal(m3[1]);
              stack.push({ color: col });
            }
          } else {
            // pop until matching tag type or stack empty
            if (tag === 'b') {
              for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].bold) { stack.splice(i, 1); break; } }
            } else {
              for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) { stack.splice(i, 1); break; } }
            }
          }
          last = re.lastIndex;
        }
        if (last < src.length) pushText(src.slice(last));
        // Split tokens by explicit newlines
        const expanded: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
        tokens.forEach(tok => {
          if (tok.t === 'br') { expanded.push(tok); return; }
          const parts = String(tok.text || '').split(/\n/);
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) expanded.push({ t: 'br' });
            if (parts[i]) expanded.push({ t: 'text', text: parts[i], style: tok.style });
          }
        });
        // Layout lines without auto word-wrap (respect explicit breaks)
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
        // measure and place
        y = 0;
        lines.forEach((arr) => {
          x = 0; lineH = 0;
          // total line width for alignment
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
        node = buildRichText(contentText, textStyle);
      } else {
        const text = new P.Text(contentText, textStyle);
        node = text;
      }
    } else {
      // fallback container
      node = new P.Container();
    }

    node.x = config.position?.x || 0;
    node.y = config.position?.y || 0;
    // size: only apply when valid finite numbers; ignore empty strings
    if (config.size && node.width !== undefined && node.height !== undefined) {
      const rw: any = (config.size as any).width;
      const rh: any = (config.size as any).height;
      const w = Number(rw);
      const h = Number(rh);
      if (Number.isFinite(w) && w > 0) node.width = Math.round(w);
      if (Number.isFinite(h) && h > 0) node.height = Math.round(h);
    }
    node.visible = config.visible !== false;
    if (config.style?.zIndex != null) node.zIndex = config.style.zIndex;
    // anchor support for sprites/planes
    try {
      if ((node as any).anchor) {
        const ax = (config.style as any)?.anchorX; const ay = (config.style as any)?.anchorY;
        if (ax != null || ay != null) (node as any).anchor.set(ax ?? (node as any).anchor.x ?? 0, ay ?? (node as any).anchor.y ?? 0);
        if ((config.style as any)?.anchorCenter) (node as any).anchor.set(0.5);
      }
    } catch {}
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
    // If explicit size provided, apply and mark as size-locked to help animations respect current size
    try {
      if (config.size && (config.size as any).width && (config.size as any).height && (node as any).width !== undefined) {
        const w = Number((config.size as any).width);
        const h = Number((config.size as any).height);
        if (Number.isFinite(w) && w > 0) (node as any).width = Math.round(w);
        if (Number.isFinite(h) && h > 0) (node as any).height = Math.round(h);
        (node as any).__sizeLocked = true;
        (node as any).__baseScale = { x: (node as any).scale?.x ?? 1, y: (node as any).scale?.y ?? 1 };
      }
    } catch {}
    this.elements.set(config.id, node);

    // If an exclusive interactive lock is active for another id,
    // immediately disable interactivity for this newly created node
    if (this.exclusiveInteractiveId && this.exclusiveInteractiveId !== config.id) {
      try {
        if (!this.savedInteraction.has(config.id)) {
          this.savedInteraction.set(config.id, {
            mode: (node as any).eventMode,
            interactive: (node as any).interactive,
            interactiveChildren: (node as any).interactiveChildren,
            hitArea: (node as any).hitArea
          });
        }
        if ('eventMode' in (node as any)) (node as any).eventMode = 'none';
        if ('interactive' in (node as any)) (node as any).interactive = false;
        if ('interactiveChildren' in (node as any)) (node as any).interactiveChildren = false;
        if ('hitArea' in (node as any)) (node as any).hitArea = null;
      } catch {}
    }

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
    // Apply anchor-related style first to avoid visual shift after position is set
    if (updates.style && (node as any).anchor) {
      const st: any = updates.style;
      if (st.anchorCenter) (node as any).anchor.set(0.5);
      const ax = st.anchorX; const ay = st.anchorY;
      if (ax != null || ay != null) (node as any).anchor.set(ax ?? (node as any).anchor.x ?? 0, ay ?? (node as any).anchor.y ?? 0);
    }
    if (updates.position) { node.x = (updates.position.x ?? node.x); node.y = (updates.position.y ?? node.y); }
    if (updates.size && node.width !== undefined) {
      const rw: any = (updates.size as any).width;
      const rh: any = (updates.size as any).height;
      const w = (rw != null) ? Number(rw) : undefined;
      const h = (rh != null) ? Number(rh) : undefined;
      let applied = false;
      if (Number.isFinite(w as any) && (w as any) > 0) { node.width = Math.round(w as any); applied = true; }
      if (Number.isFinite(h as any) && (h as any) > 0) { node.height = Math.round(h as any); applied = true; }
      if (applied) { try { (node as any).__sizeLocked = true; (node as any).__baseScale = { x: (node as any).scale?.x ?? 1, y: (node as any).scale?.y ?? 1 }; } catch {} }
    }
    if (updates.visible != null) node.visible = updates.visible;
    if (updates.rotation != null) node.rotation = updates.rotation;
    if (updates.scale && node.scale) { node.scale.x = updates.scale.x ?? node.scale.x; node.scale.y = updates.scale.y ?? node.scale.y; }
    if (updates.type === 'text' && (updates as any).content !== undefined) {
      const content = (updates as any).content;
      if ((node as any).__isRichText) {
        try {
          const base = (node as any).__richBaseStyle || {};
          const wrapWidth = (node as any).__wrapWidth;
          const P = this.pixi;
          // rebuild children
          while (node.children?.length) { try { node.removeChild(node.children[node.children.length - 1]); } catch {} }
          const builder = (contentText: string, baseStyle: any) => {
            // reuse same simple builder as in createElement
            const hasMarkup = (s: any) => { try { const t = String(s || ''); return /<\/?(b|color|c|span|br)\b/i.test(t); } catch { return false; } };
            const parseColorVal = (raw: string | undefined): any => {
              if (!raw) return undefined; const s = String(raw).trim();
              if (s.startsWith('#')) { const hex = s.length === 4 ? ('#' + s[1]+s[1]+s[2]+s[2]+s[3]+s[3]) : s; return parseInt('0x' + hex.slice(1)); }
              if (/^0x/i.test(s)) { try { return parseInt(s); } catch { return s; } }
              return s;
            };
            const tokens: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
            const stack: Array<{ bold?: boolean; color?: any }> = [];
            const cur = () => ({ bold: stack.some(s => s.bold), color: (() => { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) return stack[i].color; } return undefined; })() });
            const pushText = (s: string) => { if (!s) return; tokens.push({ t: 'text', text: s, style: cur() }); };
            const src = String(contentText || '');
            const re = /<\/?(b|color|c|span|br)([^>]*)>/ig; let last = 0; let m: RegExpExecArray | null;
            while ((m = re.exec(src))) {
              if (m.index > last) pushText(src.slice(last, m.index));
              const closing = src[m.index + 1] === '/'; const tag = m[1].toLowerCase(); const attrs = m[2] || '';
              if (tag === 'br' && !closing) { tokens.push({ t: 'br' }); last = re.lastIndex; continue; }
              if (!closing) {
                if (tag === 'b') stack.push({ bold: true });
                else if (tag === 'color' || tag === 'c') { const m1 = attrs.match(/=\s*(['"]?)(#[0-9a-fA-F]{3,8}|0x[0-9a-fA-F]+|[a-zA-Z]+)\1/); const col = parseColorVal(m1 ? m1[2] : undefined); stack.push({ color: col }); }
                else if (tag === 'span') { let col: any; const m2 = attrs.match(/\bcolor\s*=\s*['"]([^'\"]+)['"]/i); if (m2) col = parseColorVal(m2[1]); const m3 = attrs.match(/style\s*=\s*['"][^'\"]*color\s*:\s*([^;'\"]+)/i); if (!col && m3) col = parseColorVal(m3[1]); stack.push({ color: col }); }
              } else {
                if (tag === 'b') { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].bold) { stack.splice(i, 1); break; } } }
                else { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].color != null) { stack.splice(i, 1); break; } } }
              }
              last = re.lastIndex;
            }
            if (last < src.length) pushText(src.slice(last));
            const expanded: Array<{ t: 'text'|'br'; text?: string; style?: any }> = [];
            tokens.forEach(tok => { if (tok.t === 'br') { expanded.push(tok); return; } const parts = String(tok.text || '').split(/\n/); for (let i=0;i<parts.length;i++){ if(i>0) expanded.push({t:'br'}); if(parts[i]) expanded.push({t:'text', text: parts[i], style: tok.style}); } });
            // lay out again
            let x = 0, y = 0, lineH = Math.ceil(base.lineHeight || base.fontSize || 16);
            const align = String(base.align || 'left');
            const lines: Array<Array<any>> = [[]];
            expanded.forEach(tok => { if (tok.t==='br'){ lines.push([]); return;} const st = { ...base }; if (tok.style?.bold) st.fontWeight = 'bold'; if (tok.style?.color != null) st.fill = tok.style.color; const t = new P.Text(tok.text || '', st); (t as any).__segment = true; lines[lines.length-1].push(t); });
            y = 0; lines.forEach((arr) => { x = 0; lineH = 0; let lineW = 0; arr.forEach((t:any)=>{ lineW += Math.ceil(t.width); lineH = Math.max(lineH, Math.ceil(t.height)); }); let startX = 0; if (align==='center' && wrapWidth != null) startX = Math.max(0, Math.round((wrapWidth - lineW)/2)); else if (align==='right' && wrapWidth != null) startX = Math.max(0, Math.round((wrapWidth - lineW))); x = startX; arr.forEach((t:any)=>{ t.x = x; t.y = y; node.addChild(t); x += Math.ceil(t.width); }); y += (lineH>0? lineH : (base.lineHeight || base.fontSize || 16)); });
          };
          (node as any).__rawText = content;
          builder(String(content ?? ''), base);
        } catch {}
      } else {
        node.text = content;
      }
    }
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
    // Apply generic style.zIndex even for non-text nodes
    if (updates.style) {
      const st: any = updates.style;
      if (st.zIndex != null) {
        try { (node as any).zIndex = Number(st.zIndex); (node as any).parent?.sortChildren?.(); } catch {}
      }
    }
    // Update rich text base style if applicable
    if (updates.style && (node as any).__isRichText) {
      try {
        const base = (node as any).__richBaseStyle || {};
        const next = { ...base };
        const st: any = updates.style;
        if (st.fill || st.color) next.fill = (st.fill || st.color);
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
        (node as any).__richBaseStyle = next;
        // re-render with current raw text
        const raw = (node as any).__rawText;
        if (raw != null) {
          this.updateElement(id, { type: 'text', content: raw } as any);
        }
      } catch {}
    }
    // note: anchor updates handled before position
  }

  removeElement(id: string): void {
    const node = this.elements.get(id);
    if (!node) return;
    // If removing current exclusive node, clear guard
    if (this.exclusiveInteractiveId === id) {
      try { this.clearExclusiveInteractive(id); } catch {}
    }
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
  // Alias for generic handlers
  getElement(id: string): any | undefined { return this.getNode(id); }

  // Clear stage and internal registries when switching levels/scenes
  clearAll(): void {
    try {
      // remove and destroy all created nodes
      for (const [id, node] of this.elements.entries()) {
        // Detach any per-node ticker watchers (e.g., CHECK_IN_AREA)
        try {
          const watchers = (node as any).__checkAreaWatchers as Map<string, any> | undefined;
          if (watchers && this.app?.ticker) {
            watchers.forEach((w: any) => { try { this.app.ticker.remove(w.fn); } catch {} });
          }
        } catch {}
        // Remove window-level drag listeners if present
        try {
          const dh = (node as any).__dragHandlers;
          if (dh?.winUp) { window.removeEventListener('pointerup', dh.winUp as any); }
        } catch {}
        try { this.app.stage.removeChild(node); } catch {}
        try { node.destroy?.({ children: true, texture: false, baseTexture: false }); } catch {}
      }
    } catch {}
    try { this.app.stage.removeChildren(); } catch {}
    this.elements.clear();
    this.dropZones.clear();
    // Remove stage-level pointer listeners possibly registered by drag handlers
    try {
      const st: any = this.getStage?.();
      st?.removeAllListeners?.('pointermove');
      st?.removeAllListeners?.('pointerup');
      st?.removeAllListeners?.('pointerupoutside');
    } catch {}
    try { (this.app?.renderer as any)?.textureGC?.run?.(); } catch {}
    // Best-effort: clear texture caches to avoid accumulating blob textures across level switches
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
      try {
        if (!this.savedInteraction.has(eid)) {
          this.savedInteraction.set(eid, {
            mode: (node as any).eventMode,
            interactive: (node as any).interactive,
            interactiveChildren: (node as any).interactiveChildren,
            hitArea: (node as any).hitArea
          });
        }
        if ('eventMode' in (node as any)) (node as any).eventMode = 'none';
        if ('interactive' in (node as any)) (node as any).interactive = false;
        if ('interactiveChildren' in (node as any)) (node as any).interactiveChildren = false;
        if ('hitArea' in (node as any)) (node as any).hitArea = null;
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
      try {
        if ('eventMode' in (node as any)) (node as any).eventMode = saved.mode ?? (node as any).eventMode;
        if ('interactive' in (node as any)) (node as any).interactive = (saved.interactive ?? (node as any).interactive);
        if ('interactiveChildren' in (node as any)) (node as any).interactiveChildren = (saved.interactiveChildren ?? (node as any).interactiveChildren);
        if ('hitArea' in (node as any)) (node as any).hitArea = (saved.hitArea ?? (node as any).hitArea);
      } catch {}
    }
    this.savedInteraction.clear();
  }
}
