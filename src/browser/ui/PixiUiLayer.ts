import { IEventManager } from '../../types';

declare const PIXI: any;

export function attachPixiUi(
  eventManager: IEventManager | any,
  resourceManager: any,
  renderManager: any,
  PIXIRef?: any
) {
  const PIXIImpl = PIXIRef || (typeof PIXI !== 'undefined' ? PIXI : undefined);
  if (!PIXIImpl) return;

  // Gate CHOICES while YES/NO is active or blocking texts present
  let canShowChoices = false; // legacy toggle for compat only
  const delayedChoices: any[] = [];
  let blockingCount = 0;
  let buttonActiveCount = 0;
  const uiGroups = new Set<any>();

  const shouldDelayChoices = () => (buttonActiveCount > 0 || blockingCount > 0);
  const flushChoices = () => { if (!shouldDelayChoices()) { while (delayedChoices.length) renderChoices(delayedChoices.shift()); } };

  const clearAllUi = (reason = 'unknown') => {
    try {
      const stage: any = renderManager?.getStage?.();
      uiGroups.forEach((g: any) => { try { stage?.removeChild?.(g); } catch {} });
      uiGroups.clear();
      delayedChoices.length = 0;
      canShowChoices = false;
      blockingCount = 0;
      buttonActiveCount = 0;
      try { (eventManager as any)?.emit?.('ui_cleared', { reason }); } catch {}
    } catch {}
  };

  // Create 9-slice with tiling edges/center instead of stretching
  const createTiledNineSlice = (url: string, slice: { left: number; top: number; right: number; bottom: number }, w: number, h: number) => {
    const baseTex = PIXIImpl.Texture.from(url);
    const bt = baseTex.baseTexture;
    const orig: any = (baseTex as any).orig || baseTex; // width/height of original asset
    const sw = Number(orig.width || baseTex.width || bt.width || 0);
    const sh = Number(orig.height || baseTex.height || bt.height || 0);
    const L = Number(slice.left || 0), T = Number(slice.top || 0), R = Number(slice.right || 0), B = Number(slice.bottom || 0);
    const midW = Math.max(0, sw - L - R);
    const midH = Math.max(0, sh - T - B);
    const cont = new PIXIImpl.Container();
    const subTex = (x: number, y: number, w0: number, h0: number) => new PIXIImpl.Texture(bt, new PIXIImpl.Rectangle(x, y, Math.max(1, w0), Math.max(1, h0)));
    const addSprite = (child: any, x: number, y: number, w0: number, h0: number) => { child.x = x; child.y = y; child.width = w0; child.height = h0; cont.addChild(child); };
    // corners
    const tl = new PIXIImpl.Sprite(subTex(0, 0, L, T)); addSprite(tl, 0, 0, L, T);
    const tr = new PIXIImpl.Sprite(subTex(sw - R, 0, R, T)); addSprite(tr, w - R, 0, R, T);
    const bl = new PIXIImpl.Sprite(subTex(0, sh - B, L, B)); addSprite(bl, 0, h - B, L, B);
    const br = new PIXIImpl.Sprite(subTex(sw - R, sh - B, R, B)); addSprite(br, w - R, h - B, R, B);
    // edges (tiling one-dimension)
    if (midW > 0 && T > 0) { const t = new PIXIImpl.TilingSprite(subTex(L, 0, midW, T), w - L - R, T); addSprite(t, L, 0, w - L - R, T); }
    if (midW > 0 && B > 0) { const b = new PIXIImpl.TilingSprite(subTex(L, sh - B, midW, B), w - L - R, B); addSprite(b, L, h - B, w - L - R, B); }
    if (midH > 0 && L > 0) { const l = new PIXIImpl.TilingSprite(subTex(0, T, L, midH), L, h - T - B); addSprite(l, 0, T, L, h - T - B); }
    if (midH > 0 && R > 0) { const r = new PIXIImpl.TilingSprite(subTex(sw - R, T, R, midH), R, h - T - B); addSprite(r, w - R, T, R, h - T - B); }
    // center (tiling two-dimension)
    if (midW > 0 && midH > 0) { const c = new PIXIImpl.TilingSprite(subTex(L, T, midW, midH), w - L - R, h - T - B); addSprite(c, L, T, w - L - R, h - T - B); }
    return cont;
  };

  // Axis-stretch 9-slice (edges stretch only along axis)
  const createAxisNineSlice = (url: string, slice: { left: number; top: number; right: number; bottom: number }, w: number, h: number) => {
    const baseTex = PIXIImpl.Texture.from(url);
    const bt = baseTex.baseTexture;
    const frame: any = (baseTex as any).frame || new PIXIImpl.Rectangle(0, 0, (baseTex as any).width || bt.width, (baseTex as any).height || bt.height);
    const sw = frame.width, sh = frame.height;
    const L = Number(slice.left || 0), T = Number(slice.top || 0), R = Number(slice.right || 0), B = Number(slice.bottom || 0);
    const midW = Math.max(0, sw - L - R);
    const midH = Math.max(0, sh - T - B);
    const cont = new PIXIImpl.Container();
    const sub = (x: number, y: number, w0: number, h0: number) => new PIXIImpl.Texture(bt, new PIXIImpl.Rectangle(frame.x + x, frame.y + y, Math.max(1, w0), Math.max(1, h0)));
    const add = (child: any, x: number, y: number, w0: number, h0: number) => { child.x = x; child.y = y; child.width = w0; child.height = h0; cont.addChild(child); };
    const disableH = (L + R) === 0;
    const disableV = (T + B) === 0;
    if (disableV && !disableH) {
      if (L > 0) add(new PIXIImpl.Sprite(sub(0, 0, L, sh)), 0, 0, L, h);
      if (midW > 0) add(new PIXIImpl.Sprite(sub(L, 0, midW, sh)), L, 0, w - L - R, h);
      if (R > 0) add(new PIXIImpl.Sprite(sub(sw - R, 0, R, sh)), w - R, 0, R, h);
      return cont;
    }
    if (disableH && !disableV) {
      if (T > 0) add(new PIXIImpl.Sprite(sub(0, 0, sw, T)), 0, 0, w, T);
      if (midH > 0) add(new PIXIImpl.Sprite(sub(0, T, sw, midH)), 0, T, w, h - T - B);
      if (B > 0) add(new PIXIImpl.Sprite(sub(0, sh - B, sw, B)), 0, h - B, w, B);
      return cont;
    }
    if (disableH && disableV) {
      add(new PIXIImpl.Sprite(sub(0, 0, sw, sh)), 0, 0, w, h);
      return cont;
    }
    add(new PIXIImpl.Sprite(sub(0, 0, L, T)), 0, 0, L, T);
    add(new PIXIImpl.Sprite(sub(sw - R, 0, R, T)), w - R, 0, R, T);
    add(new PIXIImpl.Sprite(sub(0, sh - B, L, B)), 0, h - B, L, B);
    add(new PIXIImpl.Sprite(sub(sw - R, sh - B, R, B)), w - R, h - B, R, B);
    if (midW > 0 && T > 0) add(new PIXIImpl.Sprite(sub(L, 0, midW, T)), L, 0, w - L - R, T);
    if (midW > 0 && B > 0) add(new PIXIImpl.Sprite(sub(L, sh - B, midW, B)), L, h - B, w - L - R, B);
    if (midH > 0 && L > 0) add(new PIXIImpl.Sprite(sub(0, T, L, midH)), 0, T, L, h - T - B);
    if (midH > 0 && R > 0) add(new PIXIImpl.Sprite(sub(sw - R, T, R, midH)), w - R, T, R, h - T - B);
    if (midW > 0 && midH > 0) add(new PIXIImpl.Sprite(sub(L, T, midW, midH)), L, T, w - L - R, h - T - B);
    return cont;
  };

  eventManager.on('button_displayed', (payload: any) => {
    const ui: any = payload?.ui || {};
    const pos = payload?.position || { x: 100, y: 200 };
    const fontSize = Number(ui.fontSize ?? 16);
    const color = ui.color || '#fff';
    const padX = ui.paddingX != null ? Number(ui.paddingX) : Math.max(12, Math.ceil(fontSize * 0.75));
    const padY = ui.paddingY != null ? Number(ui.paddingY) : Math.max(6, Math.ceil(fontSize * 0.55));
    const minW = ui.minWidth != null ? Number(ui.minWidth) : Math.ceil(fontSize * 8);
    const pick = (o: any, keys: string[]) => { if (!o) return undefined; for (const k of keys) { if (o[k] != null) return o[k]; } return undefined; };
    let gapX: number | undefined = ((): any => { const v = pick(ui, ['gapX','gapx','gap_x','gap-x']); return v != null ? Number(v) : undefined; })();
    let gapY: number | undefined = ((): any => { const v = pick(ui, ['gapY','gapy','gap_y','gap-y']); return v != null ? Number(v) : undefined; })();
    const yesUrl = ui.yesResourceId ? resourceManager.getResource?.(ui.yesResourceId)?.url : undefined;
    const noUrl = ui.noResourceId ? resourceManager.getResource?.(ui.noResourceId)?.url : undefined;
    const sk = ui.buttonSkinId ? resourceManager.getSkin?.(ui.buttonSkinId) : null;
    const skinUrl = (sk?.url) ? sk.url : (sk?.imageId ? resourceManager.getResource?.(sk.imageId)?.url : undefined);
    const slice = sk?.slice;
    const stage: any = renderManager?.getStage?.();
    if (!stage) return;
    const group = new PIXIImpl.Container();
    group.x = pos.x; group.y = pos.y; (group as any).zIndex = 100;
    const mkBtn = (label: string, bgUrl?: string, sl?: any, onTap?: () => void) => {
      const btn = new PIXIImpl.Container();
      const tStyle = new PIXIImpl.TextStyle({ fontSize, fill: color, wordWrap: false });
      const measure = new PIXIImpl.Text(label, tStyle);
      const contentW = Math.ceil(measure.width);
      const contentH = Math.ceil(measure.height);
      let w = Math.max(minW, contentW + padX * 2);
      let h = contentH + padY * 2;
      let bg: any;
      const url = bgUrl || skinUrl;
      const tile = ui.tileNineSlice === true;
      if (url && sl && tile) { bg = createTiledNineSlice(url, sl, w, h); }
      else if (url && sl && (PIXIImpl as any).NineSlicePlane) { const tex = PIXIImpl.Texture.from(url); bg = new PIXIImpl.NineSlicePlane(tex, Number(sl.left||12), Number(sl.top||12), Number(sl.right||12), Number(sl.bottom||12)); bg.width = w; bg.height = h; }
      else if (url && sl) { bg = createAxisNineSlice(url, sl, w, h); }
      else if (url) { const spr = new PIXIImpl.Sprite(PIXIImpl.Texture.from(url)); spr.width = w; spr.height = h; bg = spr; }
      else { const g = new PIXIImpl.Graphics(); g.beginFill(0x2c3e50); g.drawRoundedRect(0,0,w,h,10); g.endFill(); bg = g; }
      btn.addChild(bg);
      const txt = new PIXIImpl.Text(label, tStyle);
      txt.x = Math.round((w - txt.width) / 2);
      txt.y = Math.round((h - txt.height) / 2);
      btn.addChild(txt);
      (btn as any).eventMode = 'static'; (btn as any).cursor = 'pointer';
      if (onTap) btn.on('pointertap', onTap);
      (btn as any).__w = w; (btn as any).__h = h;
      return btn;
    };
    const yesLabel = payload?.branches?.yes?.label || '是';
    const noLabel = payload?.branches?.no?.label || '否';
    const yesBtn = mkBtn(yesLabel, yesUrl, undefined, () => {
      eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'yes' });
      try { stage.removeChild(group); } catch {}
      uiGroups.delete(group);
      buttonActiveCount = Math.max(0, buttonActiveCount - 1);
      flushChoices();
    });
    const noBtn = mkBtn(noLabel, noUrl, undefined, () => {
      eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'no' });
      try { stage.removeChild(group); } catch {}
      uiGroups.delete(group);
      buttonActiveCount = Math.max(0, buttonActiveCount - 1);
      flushChoices();
    });
    const refHBtn = Math.max( (yesBtn as any).__h || 0, Math.ceil(fontSize * 2) );
    if (gapX == null || isNaN(gapX as any)) gapX = Math.max(4, Math.ceil(refHBtn * 0.2));
    if (gapY == null || isNaN(gapY as any)) gapY = Math.max(4, Math.ceil(refHBtn * 0.3));
    const hYesActual = Math.round((yesBtn as any).height || Math.ceil(fontSize * 2));
    yesBtn.y = 0; noBtn.x = 0; noBtn.y = hYesActual + (gapY as number);
    group.addChild(yesBtn); group.addChild(noBtn);
    stage.addChild(group);
    uiGroups.add(group);
    buttonActiveCount++;
    eventManager.once('button_dismissed', () => { try { stage.removeChild(group); } catch {} uiGroups.delete(group); });
  });

  function renderChoices(payload: any) {
    const ui: any = payload?.ui || {};
    const pos = payload?.position || { x: 100, y: 270 };
    const fontSize = Number(ui.fontSize ?? 16);
    const color = ui.color || '#fff';
    let gapX: number | undefined = ui.gapX != null ? Number(ui.gapX) : undefined;
    let gapY: number | undefined = ui.gapY != null ? Number(ui.gapY) : undefined;
    const padX = ui.paddingX != null ? Number(ui.paddingX) : Math.max(12, Math.ceil(fontSize * 0.75));
    const padY = ui.paddingY != null ? Number(ui.paddingY) : Math.max(6, Math.ceil(fontSize * 0.55));
    const minW = ui.minWidth != null ? Number(ui.minWidth) : Math.ceil(fontSize * 7.5);
    const maxWidthUi = (ui.maxWidth != null ? Number(ui.maxWidth) : 0) || 0; // 0 = no limit
    const stage: any = renderManager?.getStage?.(); if (!stage) return;
    const sk = ui.buttonSkinId ? resourceManager.getSkin?.(ui.buttonSkinId) : null;
    const skinUrl = (sk?.url) ? sk.url : (sk?.imageId ? resourceManager.getResource?.(sk.imageId)?.url : undefined);
    const slice = sk?.slice;
    const resId = ui.buttonResourceId || undefined;
    const url = resId ? resourceManager.getResource?.(resId)?.url : skinUrl;
    const group = new PIXIImpl.Container(); group.x = pos.x; group.y = pos.y; (group as any).zIndex = 100;
    let x = 0, y = 0, col = 0; const rowMax = Number(ui.rowMax || 1);
    const makeBtn = (label: string, onTap: () => void) => {
      const btn = new PIXIImpl.Container();
      const doWrap = (maxWidthUi > 0);
      const wrapWidth = doWrap ? Math.max(10, maxWidthUi - padX * 2) : undefined;
      const tStyle = new PIXIImpl.TextStyle({ fontSize, fill: color, wordWrap: doWrap, wordWrapWidth: wrapWidth });
      const measure = new PIXIImpl.Text(label, tStyle);
      const contentW = Math.ceil(measure.width);
      const contentH = Math.ceil(measure.height);
      let w = Math.max(minW, contentW + padX * 2);
      let h = contentH + padY * 2;
      let bg: any;
      const tile = ui.tileNineSlice === true;
      if (url && slice && tile) { bg = createTiledNineSlice(url, slice, w, h); }
      else if (url && slice && (PIXIImpl as any).NineSlicePlane) { const tex = PIXIImpl.Texture.from(url); bg = new PIXIImpl.NineSlicePlane(tex, Number(slice.left||12), Number(slice.top||12), Number(slice.right||12), Number(slice.bottom||12)); bg.width = w; bg.height = h; }
      else if (url) { const spr = new PIXIImpl.Sprite(PIXIImpl.Texture.from(url)); spr.width = w; spr.height = h; bg = spr; }
      else { const g = new PIXIImpl.Graphics(); g.beginFill(0x2c3e50); g.drawRoundedRect(0,0,w,h,10); g.endFill(); bg = g; }
      btn.addChild(bg);
      const txt = new PIXIImpl.Text(label, tStyle);
      txt.x = Math.round((w - txt.width) / 2);
      txt.y = Math.round((h - txt.height) / 2);
      btn.addChild(txt);
      (btn as any).eventMode = 'static'; (btn as any).cursor = 'pointer';
      btn.on('pointertap', onTap);
      (btn as any).__w = w; (btn as any).__h = h;
      return btn;
    };
    (payload.choices || []).forEach((opt: any, idx: number) => {
      const label = opt.text || opt.id || String(idx + 1);
      const b = makeBtn(label, () => {
        try { stage.removeChild(group); } catch {}
        eventManager.emit('choice_selected', { commandId: payload.commandId, elementId: payload.elementId, optionId: opt.id, index: idx, text: label });
      });
      if ((gapX == null || isNaN(gapX as any)) || (gapY == null || isNaN(gapY as any))) {
        const refH = Math.max(((b as any).__h) || 0, Math.ceil(fontSize * 2));
        if (gapX == null || isNaN(gapX as any)) gapX = Math.max(4, Math.ceil(refH * 0.2));
        if (gapY == null || isNaN(gapY as any)) gapY = Math.max(4, Math.ceil(refH * 0.3));
      }
      b.x = x; b.y = y; group.addChild(b); col++;
      if (rowMax > 0 && col >= rowMax) { const hBtnActual = Math.round(((b as any).height) || Math.ceil(fontSize * 2)); col = 0; x = 0; y += hBtnActual + (gapY as number); }
      else { x += Math.round(((b as any).__w) || minW) + (gapX as number); }
    });
    stage.addChild(group);
    uiGroups.add(group);
    eventManager.once('choices_dismissed', () => {
      try { stage.removeChild(group); } catch {}
      uiGroups.delete(group);
      try { (renderManager as any)?.clearExclusiveInteractive?.(); } catch {}
    });
  }

  eventManager.on('choices_displayed', (payload: any) => {
    const stage: any = renderManager?.getStage?.(); if (!stage) return;
    if (!canShowChoices) canShowChoices = true;
    // 当选择为阻塞（默认）时，设置独占交互：禁用所有已注册元素交互，仅允许UI组交互
    try { if (payload?.blocking !== false && (renderManager as any)?.setExclusiveInteractive) { (renderManager as any).setExclusiveInteractive('__UI__'); } } catch {}
    if (shouldDelayChoices()) delayedChoices.push(payload); else renderChoices(payload);
  });

  // Blocking text: click to continue, gate choices by blocking count
  eventManager.on('text_displayed', (payload: any) => {
    if (!payload?.blocking) return;
    blockingCount++;
    const node = renderManager?.getNode?.(payload.elementId);
    if (node) {
      const onContinue = () => { eventManager.emit('text_continue', { elementId: payload.elementId }); };
      try { node.eventMode = 'static'; node.cursor = 'pointer'; node.on && node.on('pointerdown', onContinue); } catch {}
    }
    // 文本阻塞期间，禁用所有已注册元素交互，仅允许该文本自身可交互
    try { (renderManager as any)?.setExclusiveInteractive?.(payload.elementId); } catch {}
  });
  eventManager.on('text_continue', (_payload: any) => {
    blockingCount = Math.max(0, blockingCount - 1);
    flushChoices();
    // 释放独占交互
    try { (renderManager as any)?.clearExclusiveInteractive?.(); } catch {}
  });

  // 清理 UI（场景跳转/游戏停止/重置时）
  eventManager.on('scene_redirect', () => { clearAllUi('scene_redirect'); try { (renderManager as any)?.clearExclusiveInteractive?.(); } catch {} });
  eventManager.on('next_level_requested', () => clearAllUi('next_level'));
  eventManager.on('game_stopped', () => clearAllUi('game_stopped'));
  eventManager.on('game_reset', () => clearAllUi('game_reset'));
}

export default { attachPixiUi };
