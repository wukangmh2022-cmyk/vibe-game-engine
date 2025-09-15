import { CommandExecutor } from '../core/CommandExecutor';
import { EventManager } from '../core/EventManager';
import { StateManager } from '../core/StateManager';
import { createDefaultHandlers } from '../commands/factory';
import { PixiCreateDropZoneHandler } from './PixiCreateDropZoneHandler';
import { PixiSetDraggableHandler } from './PixiSetDraggableHandler';
import { BrowserResourceManager } from './BrowserResourceManager';
import { BrowserAudioManager } from './BrowserAudioManager';
import { PixiRendererManager } from './PixiRendererManager';
import { PixiCheckInAreaHandler } from './PixiCheckInAreaHandler';
import { AnimateInHandler } from './AnimateInHandler';
import { AnimateLoopHandler } from './AnimateLoopHandler';
import { PixiSetElementStyleHandler } from './PixiSetElementStyleHandler';
import { FlipCardHandler } from '../commands/FlipCardHandler';
import { SetClickableHandler } from '../commands/SetClickableHandler';
import { SetSelectedHandler } from '../commands/SetSelectedHandler';
import { GameCommand } from '../types';
import { FireworkBurstHandler } from './FireworkBurstHandler';

declare const PIXI: any;

async function bootstrap() {
  const appEl = document.getElementById('app') as HTMLElement;
  const overlay = document.getElementById('overlay') as HTMLElement;
  if (!appEl) return;

  const app = new PIXI.Application({
    width: 800,
    height: 600,
    backgroundColor: 0x000000,
    antialias: true,
    resolution: Math.min(2, (window.devicePixelRatio || 1)),
    autoDensity: true
  });
  appEl.prepend(app.view as HTMLCanvasElement);
  app.stage.sortableChildren = true;

  // Expose a one-click Pixi cache clear helper
  (window as any).clearPixiCache = () => {
    try {
      const utils: any = (PIXI as any).utils;
      const BT = utils?.BaseTextureCache || {};
      const TC = utils?.TextureCache || {};
      let n = 0;
      for (const k in BT) { try { BT[k]?.destroy?.(true); } catch {} delete (BT as any)[k]; n++; }
      for (const k in TC) { try { TC[k]?.destroy?.(true); } catch {} delete (TC as any)[k]; n++; }
      try { (app.renderer as any)?.textureGC?.run?.(); } catch {}
      console.info(`[Pixi] Cleared texture caches: ${n} entries`);
    } catch (e) {
      console.warn('clearPixiCache failed', e);
    }
  };
  // Hotkey: Ctrl+Alt+K to clear cache quickly
  window.addEventListener('keydown', (e) => {
    try {
      if (e.ctrlKey && e.altKey && (e.key?.toLowerCase?.() === 'k')) {
        (window as any).clearPixiCache?.();
      }
    } catch {}
  });

  const eventManager = new EventManager();
  const stateManager = new StateManager(eventManager);
  const resourceManager = new BrowserResourceManager();
  const renderManager = new PixiRendererManager(app);
  const audioManager = new BrowserAudioManager();
  const logger = console as any;

  const executor = new CommandExecutor(stateManager, eventManager, resourceManager as any, renderManager as any, audioManager as any, logger as any);
  createDefaultHandlers().forEach(h => executor.registerHandler(h));
  // Override DOM-based handlers with Pixi versions for browser runtime
  executor.registerHandler(new PixiCreateDropZoneHandler());
  executor.registerHandler(new PixiSetDraggableHandler());
  executor.registerHandler(new PixiCheckInAreaHandler());
  executor.registerHandler(new AnimateInHandler());
  executor.registerHandler(new AnimateLoopHandler());
  executor.registerHandler(new PixiSetElementStyleHandler());
  executor.registerHandler(new FlipCardHandler());
  executor.registerHandler(new SetClickableHandler());
  executor.registerHandler(new SetSelectedHandler());
  // Effects
  executor.registerHandler(new FireworkBurstHandler());

  // Gate CHOICES until user confirms YES; also pause while blocking texts are present
  let canShowChoices = false;
  const delayedChoices: any[] = [];
  let blockingCount = 0;
  const textBackdrops = new Map<string, any>();

  // Store skins in resourceManager for handlers & UI
  const setSkins = (skins: any) => (resourceManager as any).setSkins?.(skins);

  // Create 9-slice with tiling edges/center instead of stretching
  const createTiledNineSlice = (url: string, slice: { left: number; top: number; right: number; bottom: number }, w: number, h: number) => {
    const baseTex = PIXI.Texture.from(url);
    const bt = baseTex.baseTexture;
    const orig: any = (baseTex as any).orig || baseTex; // width/height of original asset
    const sw = Number(orig.width || baseTex.width || bt.width || 0);
    const sh = Number(orig.height || baseTex.height || bt.height || 0);
    const L = Number(slice.left || 0), T = Number(slice.top || 0), R = Number(slice.right || 0), B = Number(slice.bottom || 0);
    const midW = Math.max(0, sw - L - R);
    const midH = Math.max(0, sh - T - B);
    const cont = new PIXI.Container();
    const subTex = (x: number, y: number, w0: number, h0: number) => new PIXI.Texture(bt, new PIXI.Rectangle(x, y, Math.max(1, w0), Math.max(1, h0)));
    const addSprite = (child: any, x: number, y: number, w0: number, h0: number) => { child.x = x; child.y = y; child.width = w0; child.height = h0; cont.addChild(child); };
    // corners
    const tl = new PIXI.Sprite(subTex(0, 0, L, T)); addSprite(tl, 0, 0, L, T);
    const tr = new PIXI.Sprite(subTex(sw - R, 0, R, T)); addSprite(tr, w - R, 0, R, T);
    const bl = new PIXI.Sprite(subTex(0, sh - B, L, B)); addSprite(bl, 0, h - B, L, B);
    const br = new PIXI.Sprite(subTex(sw - R, sh - B, R, B)); addSprite(br, w - R, h - B, R, B);
    // edges (tiling one-dimension)
    if (midW > 0 && T > 0) { const t = new PIXI.TilingSprite(subTex(L, 0, midW, T), w - L - R, T); addSprite(t, L, 0, w - L - R, T); }
    if (midW > 0 && B > 0) { const b = new PIXI.TilingSprite(subTex(L, sh - B, midW, B), w - L - R, B); addSprite(b, L, h - B, w - L - R, B); }
    if (midH > 0 && L > 0) { const l = new PIXI.TilingSprite(subTex(0, T, L, midH), L, h - T - B); addSprite(l, 0, T, L, h - T - B); }
    if (midH > 0 && R > 0) { const r = new PIXI.TilingSprite(subTex(sw - R, T, R, midH), R, h - T - B); addSprite(r, w - R, T, R, h - T - B); }
    // center (tiling two-dimension)
    if (midW > 0 && midH > 0) { const c = new PIXI.TilingSprite(subTex(L, T, midW, midH), w - L - R, h - T - B); addSprite(c, L, T, w - L - R, h - T - B); }
    return cont;
  };

  // Axis-stretch 9-slice (edges stretch only along axis)
  const createAxisNineSlice = (url: string, slice: { left: number; top: number; right: number; bottom: number }, w: number, h: number) => {
    const baseTex = PIXI.Texture.from(url);
    const bt = baseTex.baseTexture;
    const frame: any = (baseTex as any).frame || new PIXI.Rectangle(0, 0, (baseTex as any).width || bt.width, (baseTex as any).height || bt.height);
    const sw = frame.width, sh = frame.height;
    const L = Number(slice.left || 0), T = Number(slice.top || 0), R = Number(slice.right || 0), B = Number(slice.bottom || 0);
    const midW = Math.max(0, sw - L - R);
    const midH = Math.max(0, sh - T - B);
    const cont = new PIXI.Container();
    const sub = (x: number, y: number, w0: number, h0: number) => new PIXI.Texture(bt, new PIXI.Rectangle(frame.x + x, frame.y + y, Math.max(1, w0), Math.max(1, h0)));
    const add = (child: any, x: number, y: number, w0: number, h0: number) => { child.x = x; child.y = y; child.width = w0; child.height = h0; cont.addChild(child); };
    const disableH = (L + R) === 0; // no horizontal slicing
    const disableV = (T + B) === 0; // no vertical slicing

    if (disableV && !disableH) {
      // 3-slice horizontal: left cap, center band, right cap (all scaled vertically as a whole)
      if (L > 0) add(new PIXI.Sprite(sub(0, 0, L, sh)), 0, 0, L, h);
      if (midW > 0) add(new PIXI.Sprite(sub(L, 0, midW, sh)), L, 0, w - L - R, h);
      if (R > 0) add(new PIXI.Sprite(sub(sw - R, 0, R, sh)), w - R, 0, R, h);
      return cont;
    }

    if (disableH && !disableV) {
      // 3-slice vertical: top cap, center band, bottom cap (all scaled horizontally as a whole)
      if (T > 0) add(new PIXI.Sprite(sub(0, 0, sw, T)), 0, 0, w, T);
      if (midH > 0) add(new PIXI.Sprite(sub(0, T, sw, midH)), 0, T, w, h - T - B);
      if (B > 0) add(new PIXI.Sprite(sub(0, sh - B, sw, B)), 0, h - B, w, B);
      return cont;
    }

    if (disableH && disableV) {
      // no slicing at all
      add(new PIXI.Sprite(sub(0, 0, sw, sh)), 0, 0, w, h);
      return cont;
    }

    // Full 9-slice axis-stretch
    add(new PIXI.Sprite(sub(0, 0, L, T)), 0, 0, L, T);
    add(new PIXI.Sprite(sub(sw - R, 0, R, T)), w - R, 0, R, T);
    add(new PIXI.Sprite(sub(0, sh - B, L, B)), 0, h - B, L, B);
    add(new PIXI.Sprite(sub(sw - R, sh - B, R, B)), w - R, h - B, R, B);
    if (midW > 0 && T > 0) add(new PIXI.Sprite(sub(L, 0, midW, T)), L, 0, w - L - R, T);
    if (midW > 0 && B > 0) add(new PIXI.Sprite(sub(L, sh - B, midW, B)), L, h - B, w - L - R, B);
    if (midH > 0 && L > 0) add(new PIXI.Sprite(sub(0, T, L, midH)), 0, T, L, h - T - B);
    if (midH > 0 && R > 0) add(new PIXI.Sprite(sub(sw - R, T, R, midH)), w - R, T, R, h - T - B);
    if (midW > 0 && midH > 0) add(new PIXI.Sprite(sub(L, T, midW, midH)), L, T, w - L - R, h - T - B);
    return cont;
  };

  eventManager.on('button_displayed', (payload: any) => {
    // Render yes/no via Pixi, no DOM
    const ui: any = payload?.ui || {};
    const pos = payload?.position || { x: 100, y: 200 };
    const fontSize = Number(ui.fontSize ?? 16);
    // Respect UI paddings/minWidth when provided; else derive like dialog
    const padX = ui.paddingX != null ? Number(ui.paddingX) : Math.max(12, Math.ceil(fontSize * 0.75));
    const padY = ui.paddingY != null ? Number(ui.paddingY) : Math.max(6, Math.ceil(fontSize * 0.55));
    // Min width: prefer ui.minWidth if provided; else depend on font size
    const minW = ui.minWidth != null ? Number(ui.minWidth) : Math.ceil(fontSize * 8);
    const color = ui.color || '#fff';
    // Accept gap synonyms
    const pickBtn = (o: any, keys: string[]) => { if (!o) return undefined; for (const k of keys) { if (o[k] != null) return o[k]; } return undefined; };
    let gapX: number | undefined = ((): any => { const v = pickBtn(ui, ['gapX','gapx','gap_x','gap-x']); return v != null ? Number(v) : undefined; })();
    let gapY: number | undefined = ((): any => { const v = pickBtn(ui, ['gapY','gapy','gap_y','gap-y']); return v != null ? Number(v) : undefined; })();

    const getResFromSkin = (skinId?: string): { url?: string; slice?: any } => {
      if (!skinId) return {};
      const sk = (resourceManager as any).getSkin?.(skinId);
      const imageId = sk?.imageId;
      const url = imageId ? (resourceManager as any).getResource?.(imageId)?.url : undefined;
      return { url, slice: sk?.slice };
    };

    const yesUrl = ui.yesResourceId ? (resourceManager as any).getResource?.(ui.yesResourceId)?.url : undefined;
    const noUrl = ui.noResourceId ? (resourceManager as any).getResource?.(ui.noResourceId)?.url : undefined;
    const skinRes = getResFromSkin(ui.buttonSkinId);

    const stage: any = (renderManager as any).getStage?.();
    if (!stage || typeof PIXI === 'undefined') return;
    const group = new PIXI.Container();
    group.x = pos.x; group.y = pos.y; (group as any).zIndex = 100;
    const rowMaxBtn = Number(ui.rowMax ?? 2);

    const mkBtn = (label: string, bgUrl?: string, slice?: any, onTap?: () => void) => {
      const btn = new PIXI.Container();
      const tStyle = new PIXI.TextStyle({ fontSize, fill: color, wordWrap: false });
      const measure = new PIXI.Text(label, tStyle);
      const contentW = Math.ceil(measure.width);
      const contentH = Math.ceil(measure.height);
      let w = Math.max(minW, contentW + padX * 2);
      // Height fits text + padding by default (align with dialog). Do not clamp by slice to match deui.html.
      let h = contentH + padY * 2;
      let bg: any;
      const url = bgUrl || skinRes.url;
      const sl = bgUrl ? undefined : skinRes.slice; // only use slice when using skin image
      const tile = ui.tileNineSlice === true; // default false
      if (url && sl && tile) {
        bg = createTiledNineSlice(url, sl, w, h);
      } else if (url && sl && (PIXI as any).NineSlicePlane) {
        const tex = PIXI.Texture.from(url);
        bg = new PIXI.NineSlicePlane(tex, Number(sl.left||12), Number(sl.top||12), Number(sl.right||12), Number(sl.bottom||12));
        bg.width = w; bg.height = h;
      } else if (url && sl) {
        // Fallback to axis-stretch composed slices when NineSlicePlane is unavailable
        bg = createAxisNineSlice(url, sl, w, h);
      }
      else if (url) { const spr = new PIXI.Sprite(PIXI.Texture.from(url)); spr.width = w; spr.height = h; bg = spr; }
      else { const g = new PIXI.Graphics(); g.beginFill(0x2c3e50); g.drawRoundedRect(0,0,w,h,10); g.endFill(); bg = g; }
      btn.addChild(bg);
      const txt = new PIXI.Text(label, tStyle);
      txt.x = Math.round((w - txt.width) / 2);
      txt.y = Math.round((h - txt.height) / 2);
      btn.addChild(txt);
      btn.interactive = true; (btn as any).eventMode = 'static'; btn.cursor = 'pointer';
      if (onTap) btn.on('pointertap', onTap);
      (btn as any).__w = w; (btn as any).__h = h;
      return btn;
    };

    const yesLabel = payload?.branches?.yes?.label || '是';
    const noLabel = payload?.branches?.no?.label || '否';

    const yesBtn = mkBtn(yesLabel, yesUrl, undefined, () => {
      eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'yes' });
      // Allow choices to render after YES enabled
      canShowChoices = true;
      if (blockingCount === 0) { while (delayedChoices.length) renderChoices(delayedChoices.shift()); }
      try { stage.removeChild(group); } catch {}
    });
    const noBtn = mkBtn(noLabel, noUrl, undefined, () => {
      eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'no' });
      try { stage.removeChild(group); } catch {}
    });

    // Compute default gaps from button height when not provided (X:20%, Y:30%)
    const refHBtn = Math.max( (yesBtn as any).__h || 0, Math.ceil(fontSize * 2) );
    if (gapX == null || isNaN(gapX as any)) gapX = Math.max(4, Math.ceil(refHBtn * 0.2));
    if (gapY == null || isNaN(gapY as any)) gapY = Math.max(4, Math.ceil(refHBtn * 0.3));

    // Log computed gaps
    try { console.info('[UI] Button gaps', { gapX, gapY, refH: (yesBtn as any).__h, fontSize, rowMax: rowMaxBtn }); } catch {}

    // Place buttons with integer math to avoid subpixel visual offsets
    const hYes = (yesBtn as any).__h ? Math.round((yesBtn as any).__h) : Math.ceil(fontSize * 2);
    const hYesActual = Math.round((yesBtn as any).height || hYes);
    if (rowMaxBtn <= 1) {
      yesBtn.y = 0; noBtn.x = 0; noBtn.y = hYesActual + (gapY as number);
    } else {
      noBtn.x = Math.round(((yesBtn as any).__w || minW) + (gapX as number)); yesBtn.y = 0; noBtn.y = 0;
    }
    try {
      const actualGapY = Math.round(noBtn.y - yesBtn.y - Math.round((yesBtn as any).height || hYes));
      console.info('[UI] Button gaps (actual)', { gapX, gapY, refH: Math.round((yesBtn as any).height || hYes), actualGapY });
      if (ui.debugGaps) {
        const g = new PIXI.Graphics();
        g.lineStyle(2, 0xff00ff, 0.9);
        g.drawRect(Math.round(group.x + yesBtn.x), Math.round(group.y + yesBtn.y), Math.round((yesBtn as any).__w || yesBtn.width), Math.round(hYes));
        g.drawRect(Math.round(group.x + noBtn.x), Math.round(group.y + noBtn.y), Math.round((noBtn as any).__w || noBtn.width), Math.round((noBtn as any).__h || noBtn.height));
        // gap marker
        g.moveTo(Math.round(group.x + yesBtn.x + ((yesBtn as any).__w || yesBtn.width)/2), Math.round(group.y + yesBtn.y + hYes));
        g.lineTo(Math.round(group.x + yesBtn.x + ((yesBtn as any).__w || yesBtn.width)/2), Math.round(group.y + noBtn.y));
        stage.addChild(g);
      }
    } catch {}
    group.addChild(yesBtn); group.addChild(noBtn);
    stage.addChild(group);
    eventManager.once('button_dismissed', () => { try { stage.removeChild(group); } catch {} });
  });

  function renderChoices(payload: any) {
    const ui: any = payload.ui || {};
    const rowMax = Number(ui.rowMax || 3);
    // Accept synonyms for robustness
    const pick = (o: any, keys: string[]) => { if (!o) return undefined; for (const k of keys) { if (o[k] != null) return o[k]; } return undefined; };
    let gapX: number | undefined = ((): any => { const v = pick(ui, ['gapX','gapx','gap_x','gap-x']); return v != null ? Number(v) : undefined; })();
    let gapY: number | undefined = ((): any => { const v = pick(ui, ['gapY','gapy','gap_y','gap-y']); return v != null ? Number(v) : undefined; })();
    const fontSize = Number(ui.fontSize ?? 16);
    const padX = ui.paddingX != null ? Number(ui.paddingX) : Math.max(12, Math.ceil(fontSize * 0.75));
    const padY = ui.paddingY != null ? Number(ui.paddingY) : Math.max(6, Math.ceil(fontSize * 0.55));
    // Min width: prefer ui.minWidth if provided; else depend on font size
    const minW = ui.minWidth != null ? Number(ui.minWidth) : Math.ceil(fontSize * 7.5);
    const color = ui.color || '#fff';
    const maxWidthUi = (ui.maxWidth != null ? Number(ui.maxWidth) : 0) || 0; // 0 = no limit
    const pos = payload.position || { x: 100, y: 270 };

    const getResFromSkin = (skinId?: string): { url?: string; slice?: any } => {
      if (!skinId) return {};
      const sk = (resourceManager as any).getSkin?.(skinId);
      const imageId = sk?.imageId;
      const url = imageId ? (resourceManager as any).getResource?.(imageId)?.url : undefined;
      return { url, slice: sk?.slice };
    };

    const resId = ui.buttonResourceId || undefined;
    const skinRes = getResFromSkin(ui.buttonSkinId);
    const url = resId ? (resourceManager as any).getResource?.(resId)?.url : skinRes.url;
    const slice = skinRes.slice;

    // Create Pixi container group
    const stage: any = (renderManager as any).getStage?.();
    if (!stage || typeof PIXI === 'undefined') return;
    const group = new PIXI.Container();
    group.x = pos.x; group.y = pos.y; (group as any).zIndex = 100;

    let x = 0, y = 0, col = 0;
    const makeBtn = (label: string, onTap: () => void) => {
      const btn = new PIXI.Container();
      // measure text
      const doWrap = (maxWidthUi > 0);
      const wrapWidth = doWrap ? Math.max(10, maxWidthUi - padX * 2) : undefined;
      const tStyle = new PIXI.TextStyle({ fontSize, fill: color, wordWrap: doWrap, wordWrapWidth: wrapWidth });
      const measure = new PIXI.Text(label, tStyle);
      const contentW = Math.ceil(measure.width);
      const contentH = Math.ceil(measure.height);
      let w = Math.max(minW, contentW + padX * 2);
      // Height fits text + padding by default (align with dialog). Do not clamp by slice to match deui.html.
      let h = contentH + padY * 2;
      // background
      let bg: any;
      const tile = ui.tileNineSlice === true; // default to axis-stretch like dialog
      if (url && slice && tile) {
        bg = createTiledNineSlice(url, slice, w, h);
      } else if (url && slice && PIXI.NineSlicePlane) {
        const tex = PIXI.Texture.from(url);
        bg = new PIXI.NineSlicePlane(tex, Number(slice.left||12), Number(slice.top||12), Number(slice.right||12), Number(slice.bottom||12));
        bg.width = w; bg.height = h;
      } else if (url) {
        const spr = new PIXI.Sprite(PIXI.Texture.from(url));
        spr.width = w; spr.height = h; bg = spr;
      } else {
        const g = new PIXI.Graphics(); g.beginFill(0x2c3e50); g.drawRoundedRect(0,0,w,h,10); g.endFill(); bg = g;
      }
      btn.addChild(bg);
      // label
      const txt = new PIXI.Text(label, tStyle);
      txt.x = Math.round((w - txt.width) / 2);
      txt.y = Math.round((h - txt.height) / 2);
      btn.addChild(txt);
      // hit + interaction
      btn.interactive = true; (btn as any).eventMode = 'static'; btn.cursor = 'pointer';
      btn.on('pointertap', onTap);
      (btn as any).__w = w; (btn as any).__h = h;
      return btn;
    };

    (payload.choices || []).forEach((opt: any, idx: number) => {
      const label = opt.text || opt.id || String(idx + 1);
      const b = makeBtn(label, () => {
        // remove group and emit
        try { stage.removeChild(group); } catch {}
        eventManager.emit('choice_selected', { commandId: payload.commandId, elementId: payload.elementId, optionId: opt.id });
      });
      // Compute default gaps from button height on first item when not provided (X:20%, Y:30%)
      if ((gapX == null || isNaN(gapX as any)) || (gapY == null || isNaN(gapY as any))) {
        const refH = Math.max(((b as any).__h) || 0, Math.ceil(fontSize * 2));
        if (gapX == null || isNaN(gapX as any)) gapX = Math.max(4, Math.ceil(refH * 0.2));
        if (gapY == null || isNaN(gapY as any)) gapY = Math.max(4, Math.ceil(refH * 0.3));
        try { console.info('[UI] Choices gaps', { gapX, gapY, refH, fontSize, rowMax }); } catch {}
      }
      b.x = x; b.y = y; group.addChild(b);
      col++;
      if (rowMax > 0 && col >= rowMax) {
        const hBtnActual = Math.round(((b as any).height) || Math.ceil(fontSize * 2));
        col = 0; x = 0; y += hBtnActual + (gapY as number);
        try {
          console.info('[UI] Choices wrap (actual)', { gapX, gapY, hBtn: hBtnActual, newY: y });
          if (ui.debugGaps) {
            const gg = new PIXI.Graphics(); gg.lineStyle(2, 0x00ffff, 0.9);
            gg.drawRect(Math.round(group.x + b.x), Math.round(group.y + b.y), Math.round((b as any).__w || b.width), Math.round((b as any).__h || b.height));
            stage.addChild(gg);
          }
        } catch {}
      } else {
        x += Math.round(((b as any).__w) || minW) + (gapX as number);
      }
    });

    stage.addChild(group);
    eventManager.once('choices_dismissed', () => { try { stage.removeChild(group); } catch {} });
  }

  eventManager.on('choices_displayed', (payload: any) => {
    if (canShowChoices && blockingCount === 0) renderChoices(payload); else delayedChoices.push(payload);
  });

  // Load game config (support external override)
  const url = (window as any).__GAME_JSON_URL || '../adventure-choice-game-v2.json';
  console.info('[Runtime] Loading JSON:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch JSON: ' + url);
  let game: any;
  try {
    game = await res.json();
    console.info('[Runtime] JSON loaded OK:', game?.id || 'unknown', (game?.levels?.length || 0), 'levels');
  } catch (e) {
    console.error('[Runtime] JSON parse error for', url, e);
    const box = document.createElement('div');
    (box.style as any).position = 'absolute'; (box.style as any).left = '12px'; (box.style as any).top = '12px';
    (box.style as any).padding = '10px 12px'; (box.style as any).background = 'rgba(0,0,0,0.7)'; (box.style as any).color = '#f88'; (box.style as any).borderRadius = '6px'; (box.style as any).zIndex = '9999';
    box.textContent = 'JSON 解析失败: ' + url;
    document.body.appendChild(box);
    throw e;
  }
  // make skins available for handlers/UI
  setSkins(game.skins || game.resources?.skins || {});
  const level = game.levels[0];
  // Build id -> command index for jump targets (top-level + events)
  const topIndex = new Map<string, any>();
  const allIndex = new Map<string, any>();
  (level.commands || []).forEach((c: any) => { if (c && c.id) { topIndex.set(c.id, c); allIndex.set(c.id, c); } });
  const indexCommands = (arr: any[]) => {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      if (!c || typeof c !== 'object') continue;
      if (c.id) allIndex.set(c.id, c);
      if (Array.isArray((c as any).commands)) indexCommands((c as any).commands);
      if (Array.isArray((c as any).trueCommands)) indexCommands((c as any).trueCommands);
      if (Array.isArray((c as any).falseCommands)) indexCommands((c as any).falseCommands);
    }
  };

  // Load resources
  const images = (game.resources?.images || []) as Array<{ id: string; src: string }>;
  await resourceManager.preloadResources(images.map(img => ({ id: img.id, type: 'image', url: img.src })) as any);
  const animations = (game.resources?.animations || []) as Array<{ id: string; src: string }>;
  if (animations && animations.length) {
    await resourceManager.preloadResources(animations.map(a => ({ id: a.id, type: 'json', url: a.src })) as any);
  }
  const audios = (game.resources?.audios || []) as Array<{ id: string; src: string }>;
  if (audios && audios.length) {
    await resourceManager.preloadResources(audios.map(a => ({ id: a.id, type: 'audio', url: a.src })) as any);
  }
  // Provide audio URL resolver
  (audioManager as any).setResolver?.((id: string) => (resourceManager as any).getResource?.(id)?.url);

  // Init state
  Object.entries(level.initialState || {}).forEach(([k, v]) => stateManager.setVariable(k, v));

  // Register level events
  for (const ev of level.events || []) {
    indexCommands(ev.commands as any[]);
    for (const tr of ev.triggers || []) {
      if (tr.type === 'auto' && (tr as any).start === 'immediate') {
        (async () => { await executor.executeCommands(ev.commands as GameCommand[]); })();
      }
      if (tr.type === 'custom' && (tr as any).target) {
        eventManager.on((tr as any).target, async () => { await executor.executeCommands(ev.commands as GameCommand[]); });
      }
      if (tr.type === 'custom' && (tr as any).condition?.type === 'expression') {
        const expr = (tr as any).condition.expression as string;
        const m = /event\.type\s*===\s*'([^']+)'/.exec(expr || '');
        if (m) {
          const name = m[1];
          eventManager.on(name, async (eventData: any) => {
            const eventVar = { type: name, ...(eventData || {}) };
            try {
              if (eval(expr.replace(/\bevent\b/g, 'eventVar'))) {
                // 将事件变量注入执行上下文，供 IF_CONDITION 表达式使用
                executor.updateContext({ event: eventVar, lastEvent: eventVar } as any);
                await executor.executeCommands(ev.commands as GameCommand[]);
              }
            } catch {}
          });
        }
      }
    }
  }

  // Handle jump_to_requested: allow JSON to jump to any indexed command
  eventManager.on('jump_to_requested', (payload: any) => {
    const target = payload?.target;
    if (!target) return;
    const cmd = allIndex.get(target) || topIndex.get(target);
    if (!cmd) { console.warn('jump target not found:', target); return; }
    // 让当前子指令链先完成，再执行跳转，避免和当前链路竞争
    setTimeout(() => {
      executor.executeCommand(cmd);
    }, 0);
  });

  // 配对检测改为 JSON 逻辑；此处不做运行时配对

  // Blocking text: add a clickable backdrop and click text itself to continue
  eventManager.on('text_displayed', (payload: any) => {
    if (!payload?.blocking) return;
    blockingCount++;
    const node = (renderManager as any)?.getNode?.(payload.elementId);
    if (node) {
      const onContinue = () => { eventManager.emit('text_continue', { elementId: payload.elementId }); };
      node.eventMode = 'static'; node.cursor = 'pointer'; node.on && node.on('pointerdown', onContinue);
    }
  });
  eventManager.on('text_continue', (payload: any) => {
    blockingCount = Math.max(0, blockingCount - 1);
    // no backdrop to remove
    if (canShowChoices && blockingCount === 0) {
      while (delayedChoices.length) renderChoices(delayedChoices.shift());
    }
  });

  // Run initial commands
  for (const cmd of level.commands as GameCommand[]) {
    await executor.executeCommand(cmd);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
