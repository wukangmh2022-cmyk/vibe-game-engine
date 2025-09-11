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

declare const PIXI: any;

async function bootstrap() {
  const appEl = document.getElementById('app') as HTMLElement;
  const overlay = document.getElementById('overlay') as HTMLElement;
  if (!appEl || !overlay) return;

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

  // Gate CHOICES until user confirms YES; also pause while blocking texts are present
  let canShowChoices = false;
  const delayedChoices: any[] = [];
  let blockingCount = 0;
  const textBackdrops = new Map<string, any>();

  // UI bridge for BUTTON and CHOICES
  function clearNode(n: HTMLElement) { while (n.firstChild) n.removeChild(n.firstChild); }

  eventManager.on('button_displayed', (payload: any) => {
    // simple row with Yes/No
    const row = document.createElement('div');
    row.style.position = 'absolute';
    row.style.left = '100px';
    row.style.top = '200px';
    row.style.display = 'flex';
    row.style.gap = '8px';
    (row.style as any).pointerEvents = 'auto';
    const yes = document.createElement('button');
    yes.className = 'choice-btn';
    yes.textContent = payload?.branches?.yes?.label || '是';
    const no = document.createElement('button');
    no.className = 'choice-btn';
    no.textContent = payload?.branches?.no?.label || '否';
    row.appendChild(yes); row.appendChild(no);
    overlay.appendChild(row);
    yes.onclick = () => {
      eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'yes' });
      canShowChoices = true;
      if (blockingCount === 0) {
        while (delayedChoices.length) renderChoices(delayedChoices.shift());
      }
    };
    no.onclick = () => eventManager.emit('button_clicked', { commandId: payload.commandId, elementId: payload.elementId, branch: 'no' });
    eventManager.once('button_dismissed', () => row.remove());
  });

  function renderChoices(payload: any) {
    const box = document.createElement('div');
    box.className = 'choices';
    (box.style as any).pointerEvents = 'auto';
    const title = document.createElement('div');
    title.textContent = payload.title || '请选择';
    title.style.marginBottom = '6px';
    box.appendChild(title);
    (payload.choices || []).forEach((opt: any, idx: number) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = opt.text || opt.id || String(idx + 1);
      btn.onclick = () => {
        // 立即隐藏本次选项容器，避免与子命令的阻塞文本重叠
        (box.style as any).visibility = 'hidden';
        (box.style as any).pointerEvents = 'none';
        eventManager.emit('choice_selected', { commandId: payload.commandId, elementId: payload.elementId, optionId: opt.id });
      };
      box.appendChild(btn);
    });
    overlay.appendChild(box);
    eventManager.once('choices_dismissed', () => box.remove());
  }

  eventManager.on('choices_displayed', (payload: any) => {
    if (canShowChoices && blockingCount === 0) renderChoices(payload); else delayedChoices.push(payload);
  });

  // Load game config
  const res = await fetch('../adventure-choice-game-v2.json');
  const game = await res.json();
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

  // Blocking text: add a clickable backdrop and click text itself to continue
  eventManager.on('text_displayed', (payload: any) => {
    if (!payload?.blocking) return;
    blockingCount++;
    const node = (renderManager as any)?.getNode?.(payload.elementId);
    if (node) {
      const padX = 14, padY = 10, radius = 8;
      const b = node.getBounds();
      const g = new PIXI.Graphics();
      g.beginFill(0x000000, 0.55).drawRoundedRect(b.x - padX, b.y - padY, b.width + padX * 2, b.height + padY * 2, radius).endFill();
      g.zIndex = (node.zIndex || 0) - 1;
      const onContinue = () => { eventManager.emit('text_continue', { elementId: payload.elementId }); };
      g.eventMode = 'static'; g.cursor = 'pointer'; g.on('pointerdown', onContinue);
      node.eventMode = 'static'; node.cursor = 'pointer'; node.on && node.on('pointerdown', onContinue);
      app.stage.addChild(g);
      textBackdrops.set(payload.elementId, g);
    }
  });
  eventManager.on('text_continue', (payload: any) => {
    blockingCount = Math.max(0, blockingCount - 1);
    const g = textBackdrops.get(payload?.elementId);
    if (g) { try { app.stage.removeChild(g); g.destroy?.(); } catch {} textBackdrops.delete(payload.elementId); }
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
