import { CommandContext } from '../types';

type Direction = 'down' | 'left' | 'right' | 'up';

interface RpgActorInstance {
  id: string;
  sprite?: any;
  marker?: any;
  dom?: HTMLElement;
  spriteUrl?: string;
  domFrame?: number;
  x: number;
  y: number;
  direction: Direction;
  frameWidth: number;
  frameHeight: number;
  frames: Record<Direction, any[]>;
  moving?: boolean;
  behaviorTimer?: any;
}

interface RpgEventObjectInstance {
  id: string;
  sprite?: any;
  x: number;
  y: number;
  width: number;
  height: number;
  triggerWidth: number;
  triggerHeight: number;
  triggerMode: string;
  triggerEvent: string;
  lastTouchAt?: number;
}

// Bundled LPC walk-only sheets are arranged as up, left, down, right.
const DIRECTION_ROWS: Direction[] = ['up', 'left', 'down', 'right'];

export class RpgWorld {
  private static instances = new WeakMap<any, RpgWorld>();

  static fromContext(context: CommandContext): RpgWorld {
    const key = context.renderManager as any;
    let existing = RpgWorld.instances.get(key);
    if (!existing) {
      existing = new RpgWorld(context);
      RpgWorld.instances.set(key, existing);
    }
    existing.context = context;
    return existing;
  }

  private context: CommandContext;
  private actors = new Map<string, RpgActorInstance>();
  private eventObjects = new Map<string, RpgEventObjectInstance>();
  private mapElements: any[] = [];
  private mapRoot?: any;
  private baseLayer?: any;
  private actorLayer?: any;
  private lightLayer?: any;
  private occlusionLayer?: any;
  private dialogueLayer?: any;
  private dialogueBox?: any;
  private hudLayer?: any;
  private hudElements: any[] = [];
  private hudTimer?: any;
  private passabilityCanvas?: HTMLCanvasElement;
  private currentMapId = '';
  private currentMapSize = { width: 0, height: 0 };
  private camera = { mode: 'none', targetActorId: '', clampToMap: true };
  private movingActors = new Set<string>();
  private pressedKeys = new Set<string>();
  private inputLoopStarted = false;
  private lastInputFrame = 0;

  private constructor(context: CommandContext) {
    this.context = context;
    this.installDebugApi();
  }

  loadMap(mapId: string, spawnPointId?: string, heroActorId?: string) {
    const game = this.getGame();
    const map = (game?.rpg?.maps || []).find((m: any) => m.id === mapId);
    if (!map) throw new Error(`RPG map not found: ${mapId}`);

    this.clearMapElements();
    this.currentMapId = mapId;
    this.currentMapSize = { width: Number(map.size?.width || 0), height: Number(map.size?.height || 0) };
    this.context.stateManager?.setVariable?.('var.rpg.currentMap', mapId);

    this.createMapContainers();
    this.addImageLayer(this.baseLayer, map.layers?.base, map.size, 0, 'normal');
    this.addImageLayer(this.lightLayer, map.layers?.overlayLight, map.size, 0.72, 'add');
    this.addImageLayer(this.occlusionLayer, map.layers?.overlayOcclusion, map.size, 0.68, 'normal');
    this.loadPassabilityMask(map.layers?.passabilityMask?.resourceId);
    this.createEventObjects(map);
    this.createZoneMarkers(map);

    const spawn = (map.spawnPoints || []).find((s: any) => s.id === spawnPointId) || map.spawnPoints?.[0];
    if (heroActorId && spawn) {
      this.setActor(heroActorId, {
        mapId,
        x: Number(spawn.x) || 0,
        y: Number(spawn.y) || 0,
        direction: (spawn.direction || 'down') as Direction
      });
    }

    this.emit(`rpg:map_loaded:${mapId}`, { mapId, spawnPointId });
  }

  setActor(actorId: string, initial?: { mapId?: string; x?: number; y?: number; direction?: Direction }) {
    const game = this.getGame();
    const actor = (game?.rpg?.actors || []).find((a: any) => a.id === actorId);
    if (!actor) throw new Error(`RPG actor not found: ${actorId}`);

    const pos = {
      ...(actor.initial || {}),
      ...(initial || {})
    };
    const mapId = pos.mapId || this.currentMapId;
    if (mapId && mapId !== this.currentMapId) return;

    const frameWidth = Number(actor.sprite?.frameWidth) || 64;
    const frameHeight = Number(actor.sprite?.frameHeight) || 64;
    const x = Number(pos.x) || 0;
    const y = Number(pos.y) || 0;
    const direction = (pos.direction || 'down') as Direction;

    let inst = this.actors.get(actorId);
    if (!inst) {
      inst = {
        id: actorId,
        spriteUrl: this.resourceUrl(actor.sprite?.resourceId),
        x,
        y,
        direction,
        frameWidth,
        frameHeight,
        frames: this.createFrames(actor.sprite?.resourceId, frameWidth, frameHeight)
      };
      inst.marker = this.createActorMarker(inst);
      inst.sprite = this.createActorSprite(inst, actor.displayName || actorId);
      inst.dom = this.createDomActor(inst);
      this.actors.set(actorId, inst);
    }

    inst.x = x;
    inst.y = y;
    inst.direction = direction;
    this.applyActorPosition(inst);
    this.setDirection(inst, direction, false);
    this.writeActorState(actorId, x, y, direction);
  }

  moveActor(actorId: string, to: { x?: number; y?: number; relative?: boolean; duration?: number }) {
    const inst = this.actors.get(actorId);
    if (!inst) throw new Error(`RPG actor instance not found: ${actorId}`);
    if (this.movingActors.has(actorId)) return Promise.resolve();

    const fromX = inst.x;
    const fromY = inst.y;
    const targetX = to.relative ? fromX + Number(to.x || 0) : Number(to.x ?? fromX);
    const targetY = to.relative ? fromY + Number(to.y || 0) : Number(to.y ?? fromY);
    if (!this.canStandAt(targetX, targetY)) {
      this.emit(`rpg:collision:${actorId}`, { actorId, x: targetX, y: targetY, mapId: this.currentMapId });
      return Promise.resolve();
    }
    const duration = Math.max(0, Number(to.duration ?? 450));
    this.movingActors.add(actorId);
    this.setDirection(inst, this.directionForDelta(targetX - fromX, targetY - fromY), true);

    return new Promise<void>((resolve) => {
      const start = Date.now();
      const step = () => {
        const t = duration <= 0 ? 1 : Math.min(1, (Date.now() - start) / duration);
        inst.x = fromX + (targetX - fromX) * t;
        inst.y = fromY + (targetY - fromY) * t;
        this.applyActorPosition(inst);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          inst.x = targetX;
          inst.y = targetY;
          this.applyActorPosition(inst);
          this.setDirection(inst, inst.direction, false);
          this.writeActorState(actorId, inst.x, inst.y, inst.direction);
          this.checkZones(inst);
          this.movingActors.delete(actorId);
          resolve();
        }
      };
      step();
    });
  }

  transferActor(actorId: string, targetMapId: string, targetSpawnPointId?: string) {
    this.loadMap(targetMapId, targetSpawnPointId, actorId);
    this.emit(`rpg:transfer:${actorId}`, { actorId, targetMapId, targetSpawnPointId });
  }

  setBehavior(actorId: string, behavior: any) {
    const inst = this.actors.get(actorId);
    if (!inst) return;
    if (inst.behaviorTimer) {
      clearInterval(inst.behaviorTimer);
      inst.behaviorTimer = undefined;
    }
    const mode = behavior?.mode || 'idle';
    if (mode === 'idle' || mode === 'scripted') return;

    if (mode === 'patrol') {
      const waypoints = Array.isArray(behavior.waypoints) ? behavior.waypoints : [];
      if (!waypoints.length) return;
      let index = 0;
      inst.behaviorTimer = setInterval(() => {
        const p = waypoints[index % waypoints.length];
        index += 1;
        this.moveActor(actorId, { x: p.x, y: p.y, duration: behavior.duration ?? 900 }).catch(() => {});
      }, Number(behavior.interval || 1200));
      return;
    }

    if (mode === 'wander') {
      const radius = Number(behavior.radius || 96);
      const origin = { x: inst.x, y: inst.y };
      inst.behaviorTimer = setInterval(() => {
        const x = origin.x + (Math.random() * 2 - 1) * radius;
        const y = origin.y + (Math.random() * 2 - 1) * radius;
        this.moveActor(actorId, { x, y, duration: behavior.duration ?? 700 }).catch(() => {});
      }, Number(behavior.interval || 1400));
    }
  }

  setCamera(camera: any) {
    this.camera = {
      mode: camera?.mode || 'none',
      targetActorId: camera?.targetActorId || camera?.target || '',
      clampToMap: camera?.clampToMap !== false && camera?.bounds !== false
    };
    this.updateCamera();
  }

  mountHud(config?: any) {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    const stage = rm?.getStage?.();
    if (!P || !stage) return;
    const game = this.getGame();
    const hud = config || game?.rpg?.ui?.hud || {};
    if (hud.visible === false) return;

    if (!this.hudLayer) {
      this.hudLayer = new P.Container();
      this.hudLayer.name = 'rpg.hudLayer';
      this.hudLayer.zIndex = 30000;
      stage.addChild(this.hudLayer);
    }
    this.hudLayer.removeChildren?.();
    this.hudElements = [];
    if (this.hudTimer) clearInterval(this.hudTimer);

    const items = Array.isArray(hud.items) && hud.items.length ? hud.items : this.defaultHudItems();
    const panel = new P.Graphics();
    panel.beginFill(0x101820, 0.62);
    panel.lineStyle(1, 0xffffff, 0.16);
    panel.drawRoundedRect(12, 12, 286, 88, 8);
    panel.endFill();
    panel.zIndex = 0;
    this.hudLayer.addChild(panel);

    for (const item of items) {
      if ((item.type || 'text') !== 'text') continue;
      const text = new P.Text('', {
        fontFamily: item.fontFamily || 'Arial, sans-serif',
        fontSize: Number(item.fontSize || 16),
        fill: item.fill || '#ffffff',
        stroke: item.stroke || '#102033',
        strokeThickness: Number(item.strokeThickness ?? 3)
      });
      text.x = Number(item.x || 0);
      text.y = Number(item.y || 0);
      text.zIndex = Number(item.zIndex || 1);
      this.hudLayer.addChild(text);
      this.hudElements.push({ item, text });
    }
    this.updateHud();
    this.hudTimer = setInterval(() => this.updateHud(), Number(hud.refreshMs || 250));
  }

  emitNearbyInteraction(actorId: string, radius = 72) {
    const source = this.actors.get(actorId);
    if (!source) return;
    let nearest: RpgActorInstance | undefined;
    let best = Infinity;
    for (const other of this.actors.values()) {
      if (other.id === actorId) continue;
      const d = Math.hypot(other.x - source.x, other.y - source.y);
      if (d < best && d <= radius) {
        best = d;
        nearest = other;
      }
    }
    if (nearest) {
      this.showDialogueFor(nearest.id);
      this.emit(`rpg:talk:${nearest.id}`, { actorId: nearest.id, sourceActorId: actorId, distance: best });
      return;
    }
    for (const obj of this.eventObjects.values()) {
      if (obj.triggerMode !== 'action') continue;
      const d = Math.hypot(obj.x - source.x, obj.y - source.y);
      if (d <= radius) {
        this.emitEventObject(obj, source.id);
        return;
      }
    }
  }

  private getGame(): any {
    try { return (window as any).__GAME_JSON || {}; } catch { return {}; }
  }

  private resourceUrl(resourceId: string): string {
    const res = this.context.resourceManager?.getResource?.(resourceId);
    return res?.url || res?.src || resourceId;
  }

  private createFrames(resourceId: string, width: number, height: number): Record<Direction, any[]> {
    const P = (this.context.renderManager as any)?.getPixi?.();
    const url = this.resourceUrl(resourceId);
    const base = P.Texture.from(url);
    const frames: any = {};
    DIRECTION_ROWS.forEach((dir, row) => {
      frames[dir] = [];
      for (let col = 0; col < 9; col += 1) {
        frames[dir].push(new P.Texture(base.baseTexture, new P.Rectangle(col * width, row * height, width, height)));
      }
    });
    return frames;
  }

  private createActorSprite(inst: RpgActorInstance, label: string) {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    if (!P) return undefined;
    const sprite = new P.AnimatedSprite(inst.frames[inst.direction]);
    sprite.anchor.set(0.5, 1);
    sprite.animationSpeed = 0.12;
    sprite.loop = true;
    sprite.zIndex = 50;
    sprite.name = label;
    (this.actorLayer || rm?.getStage?.())?.addChild(sprite);
    this.mapElements.push(sprite);
    return sprite;
  }

  private createActorMarker(inst: RpgActorInstance) {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    if (!P) return undefined;
    const marker = new P.Graphics();
    const isHero = inst.id === 'actor.hero';
    marker.beginFill(0x000000, 0.28);
    marker.drawEllipse(0, -4, isHero ? 18 : 14, isHero ? 7 : 5);
    marker.endFill();
    if (isHero) {
      marker.lineStyle(2, 0xffffff, 0.92);
      marker.beginFill(0x4fc3ff, 0.96);
      marker.moveTo(0, -56);
      marker.lineTo(-9, -70);
      marker.lineTo(9, -70);
      marker.lineTo(0, -56);
      marker.endFill();
      if (this.debugVisible()) {
        marker.lineStyle(2, 0x4fc3ff, 0.95);
        marker.drawEllipse(0, -4, 22, 10);
      }
    }
    marker.name = `${inst.id}.marker`;
    marker.zIndex = 0;
    (this.actorLayer || rm?.getStage?.())?.addChild(marker);
    this.mapElements.push(marker);
    return marker;
  }

  private createZoneMarkers(map: any) {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    if (!P || !this.actorLayer) return;
    for (const zone of map?.zones || []) {
      if (zone?.shape !== 'rect') continue;
      const isTransfer = Array.isArray(zone.tags) && zone.tags.includes('transfer');
      if (!isTransfer) continue;
      if (!this.debugVisible()) continue;
      const g = new P.Graphics();
      const x = Number(zone.x || 0);
      const y = Number(zone.y || 0);
      const w = Number(zone.width || 0);
      const h = Number(zone.height || 0);
      g.lineStyle(4, 0x58d6ff, 0.9);
      g.beginFill(0x58d6ff, 0.16);
      g.drawRoundedRect(x, y, w, h, 10);
      g.endFill();
      g.lineStyle(2, 0xffffff, 0.85);
      g.moveTo(x + w / 2 - 24, y + h / 2);
      g.lineTo(x + w / 2 + 24, y + h / 2);
      g.moveTo(x + w / 2 + 12, y + h / 2 - 12);
      g.lineTo(x + w / 2 + 24, y + h / 2);
      g.lineTo(x + w / 2 + 12, y + h / 2 + 12);
      g.name = `${zone.id}.marker`;
      g.zIndex = Math.round(y + h) - 2;
      this.actorLayer.addChild(g);
      this.mapElements.push(g);
      this.createDomZone(zone);
    }
  }

  private createEventObjects(map: any) {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    if (!P || !this.actorLayer) return;
    for (const obj of map?.eventObjects || []) {
      const spriteDef = obj.sprite || {};
      const resourceId = spriteDef.resourceId;
      if (!resourceId) continue;
      const frameWidth = Number(spriteDef.frameWidth || 64);
      const frameHeight = Number(spriteDef.frameHeight || 64);
      const framesPerRow = Number(spriteDef.frames || spriteDef.framesPerRow || 8);
      const row = Number(spriteDef.row || 0);
      const base = P.Texture.from(this.resourceUrl(resourceId));
      const frames: any[] = [];
      for (let col = 0; col < framesPerRow; col += 1) {
        frames.push(new P.Texture(base.baseTexture, new P.Rectangle(col * frameWidth, row * frameHeight, frameWidth, frameHeight)));
      }
      const sprite = new P.AnimatedSprite(frames);
      sprite.anchor.set(Number(spriteDef.anchor?.x ?? 0.5), Number(spriteDef.anchor?.y ?? 1));
      sprite.animationSpeed = Number(spriteDef.animationSpeed ?? 0.12);
      sprite.loop = spriteDef.loop !== false;
      sprite.x = Number(obj.x || 0);
      sprite.y = Number(obj.y || 0);
      sprite.zIndex = Math.round(sprite.y + Number(obj.zOffset || 0));
      sprite.name = obj.id || 'rpg.eventObject';
      sprite.play();
      this.actorLayer.addChild(sprite);
      this.mapElements.push(sprite);
      this.eventObjects.set(String(obj.id || sprite.name), {
        id: String(obj.id || sprite.name),
        sprite,
        x: sprite.x,
        y: sprite.y,
        width: frameWidth,
        height: frameHeight,
        triggerWidth: Number(obj.trigger?.width || obj.width || 48),
        triggerHeight: Number(obj.trigger?.height || obj.height || 48),
        triggerMode: String(obj.trigger?.mode || 'touch'),
        triggerEvent: String(obj.trigger?.event || obj.event || '')
      });
    }
  }

  private domLayer(): HTMLElement | null {
    try {
      if (typeof document === 'undefined') return null;
      const params = new URLSearchParams(window.location.search);
      if (params.get('rpgDom') !== '1' && !(window as any).__RPG_DOM_FALLBACK__) return null;
      let el = document.getElementById('rpg-dom-layer');
      if (!el) {
        el = document.createElement('div');
        el.id = 'rpg-dom-layer';
        document.body.appendChild(el);
        Object.assign(el.style, {
          position: 'fixed',
          left: '0',
          top: '0',
          width: '0',
          height: '0',
          pointerEvents: 'none',
          zIndex: '2147482500',
          transformOrigin: '0 0',
          overflow: 'visible'
        } as any);
        if (!document.getElementById('rpg-dom-style')) {
          const style = document.createElement('style');
          style.id = 'rpg-dom-style';
          style.textContent = '@keyframes rpg-walk-x { from { background-position-x: 0px; } to { background-position-x: -576px; } }';
          document.head.appendChild(style);
        }
      }
      return el;
    } catch {
      return null;
    }
  }

  private rendererRect() {
    const app = (this.context.renderManager as any)?.getApp?.();
    const canvas = app?.view || (typeof document !== 'undefined' ? document.querySelector('canvas') : null);
    const rect = canvas?.getBoundingClientRect?.();
    const { width, height } = this.viewportSize();
    return rect ? { rect, width, height } : null;
  }

  private viewportSize() {
    const app = (this.context.renderManager as any)?.getApp?.();
    return {
      width: Number(app?.screen?.width || app?.renderer?.screen?.width || 800),
      height: Number(app?.screen?.height || app?.renderer?.screen?.height || 600)
    };
  }

  private debugVisible() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('rpgDebug') === '1' || (window as any).__RPG_DEBUG_VISIBLE__ === true;
    } catch {
      return false;
    }
  }

  private worldToClient(x: number, y: number) {
    const info = this.rendererRect();
    if (!info) return null;
    const screenX = Number(this.mapRoot?.x || 0) + x;
    const screenY = Number(this.mapRoot?.y || 0) + y;
    return {
      x: info.rect.left + (screenX / info.width) * info.rect.width,
      y: info.rect.top + (screenY / info.height) * info.rect.height,
      scaleX: info.rect.width / info.width,
      scaleY: info.rect.height / info.height
    };
  }

  private updateDomRoot() {
    const layer = this.domLayer();
    const info = this.rendererRect();
    if (!layer || !info) return null;
    const sx = info.rect.width / info.width;
    const sy = info.rect.height / info.height;
    layer.style.left = `${Math.round(info.rect.left + Number(this.mapRoot?.x || 0) * sx)}px`;
    layer.style.top = `${Math.round(info.rect.top + Number(this.mapRoot?.y || 0) * sy)}px`;
    layer.style.width = `${Math.round(this.currentMapSize.width * sx)}px`;
    layer.style.height = `${Math.round(this.currentMapSize.height * sy)}px`;
    layer.style.transform = 'none';
    return { sx, sy };
  }

  private createDomActor(inst: RpgActorInstance): HTMLElement | undefined {
    const layer = this.domLayer();
    if (!layer || !inst.spriteUrl) return undefined;
    const el = document.createElement('div');
    el.dataset.rpgActorId = inst.id;
    const isHero = inst.id === 'actor.hero';
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '64px',
      height: '64px',
      backgroundImage: `url("${inst.spriteUrl}")`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '576px 256px',
      imageRendering: 'pixelated',
      transformOrigin: '50% 100%',
      filter: isHero ? 'drop-shadow(0 0 6px rgba(88,214,255,.95))' : 'drop-shadow(0 3px 3px rgba(0,0,0,.45))',
      zIndex: isHero ? '2147482700' : '2147482600'
    } as any);
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'absolute',
      left: '12px',
      bottom: '0',
      width: '40px',
      height: '14px',
      border: isHero ? '3px solid #58d6ff' : '0',
      borderRadius: '50%',
      boxSizing: 'border-box'
    } as any);
    el.appendChild(ring);
    if (isHero) {
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        position: 'absolute',
        left: '29px',
        top: '-10px',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#58d6ff'
      } as any);
      el.appendChild(dot);
    }
    layer.appendChild(el);
    return el;
  }

  private updateDomActor(inst: RpgActorInstance) {
    if (!inst.dom) return;
    const scaleInfo = this.updateDomRoot();
    if (!scaleInfo) return;
    const scale = Math.max(1, Math.min(scaleInfo.sx, scaleInfo.sy));
    const row = Math.max(0, DIRECTION_ROWS.indexOf(inst.direction));
    const frame = inst.moving ? Math.floor(Date.now() / 90) % 9 : 0;
    inst.domFrame = frame;
    inst.dom.style.left = `${Math.round(inst.x * scaleInfo.sx - 32 * scale)}px`;
    inst.dom.style.top = `${Math.round(inst.y * scaleInfo.sy - 64 * scale)}px`;
    inst.dom.style.transform = `scale(${scale})`;
    inst.dom.style.backgroundPosition = `-${frame * 64}px -${row * 64}px`;
    inst.dom.style.animation = 'none';
    const clientX = Number(this.domLayer()?.style.left?.replace('px', '') || 0) + inst.x * scaleInfo.sx;
    const clientY = Number(this.domLayer()?.style.top?.replace('px', '') || 0) + inst.y * scaleInfo.sy;
    inst.dom.style.display = clientX < -80 || clientY < -100 || clientX > window.innerWidth + 80 || clientY > window.innerHeight + 80 ? 'none' : 'block';
  }

  private updateDomActors() {
    for (const actor of this.actors.values()) this.updateDomActor(actor);
  }

  private createDomZone(zone: any) {
    const layer = this.domLayer();
    if (!layer) return;
    const el = document.createElement('div');
    el.dataset.rpgZoneId = zone.id || 'zone';
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      border: '4px solid #58d6ff',
      borderRadius: '10px',
      background: 'rgba(88,214,255,.14)',
      boxSizing: 'border-box',
      zIndex: '2147482400'
    } as any);
    const arrow = document.createElement('div');
    arrow.textContent = '->';
    Object.assign(arrow.style, {
      position: 'absolute',
      inset: '0',
      display: 'grid',
      placeItems: 'center',
      color: 'rgba(255,255,255,.9)',
      font: '48px/1 Arial, sans-serif'
    } as any);
    el.appendChild(arrow);
    layer.appendChild(el);
    this.updateDomZone(el, zone);
  }

  private updateDomZone(el: Element, zone: any) {
    const scaleInfo = this.updateDomRoot();
    if (!scaleInfo) return;
    const style = (el as HTMLElement).style;
    style.left = `${Math.round(Number(zone.x || 0) * scaleInfo.sx)}px`;
    style.top = `${Math.round(Number(zone.y || 0) * scaleInfo.sy)}px`;
    style.width = `${Math.round(Number(zone.width || 0) * scaleInfo.sx)}px`;
    style.height = `${Math.round(Number(zone.height || 0) * scaleInfo.sy)}px`;
  }

  private updateDomZones() {
    const game = this.getGame();
    const map = (game?.rpg?.maps || []).find((m: any) => m.id === this.currentMapId);
    for (const el of Array.from(document.querySelectorAll('[data-rpg-zone-id]'))) {
      const zone = (map?.zones || []).find((z: any) => z.id === (el as HTMLElement).dataset.rpgZoneId);
      if (zone) this.updateDomZone(el, zone);
    }
  }

  private clearDomOverlays() {
    try {
      document.querySelectorAll('[data-rpg-actor-id], [data-rpg-zone-id]').forEach(el => el.remove());
    } catch {}
  }

  private applyActorPosition(inst: RpgActorInstance) {
    if (inst.marker) {
      inst.marker.x = inst.x;
      inst.marker.y = inst.y;
      inst.marker.zIndex = Math.round(inst.y) - 1;
    }
    if (inst.sprite) {
      inst.sprite.x = inst.x;
      inst.sprite.y = inst.y;
      inst.sprite.zIndex = Math.round(inst.y);
    }
    this.updateCamera();
    this.updateDomActor(inst);
  }

  private setDirection(inst: RpgActorInstance, direction: Direction, moving: boolean) {
    const directionChanged = inst.direction !== direction;
    const movingChanged = inst.moving !== moving;
    inst.direction = direction;
    inst.moving = moving;
    if (inst.sprite && inst.frames[direction]) {
      if (directionChanged) inst.sprite.textures = inst.frames[direction];
      if (moving) {
        if (directionChanged || movingChanged || !inst.sprite.playing) inst.sprite.play();
      } else if (movingChanged || inst.sprite.playing) {
        inst.sprite.gotoAndStop(0);
      }
    }
    this.updateDomActor(inst);
  }

  private directionForDelta(dx: number, dy: number): Direction {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  private writeActorState(actorId: string, x: number, y: number, direction: Direction) {
    const slug = actorId.replace(/^actor\./, '');
    this.context.stateManager?.setVariable?.(`var.actor.${slug}.x`, Math.round(x));
    this.context.stateManager?.setVariable?.(`var.actor.${slug}.y`, Math.round(y));
    this.context.stateManager?.setVariable?.(`var.actor.${slug}.direction`, direction);
  }

  private defaultHudItems() {
    return [
      { type: 'text', x: 28, y: 24, text: '地图: {var.rpg.currentMap}', fontSize: 16 },
      { type: 'text', x: 28, y: 50, text: '任务阶段: {var.quest.main.stage}', fontSize: 16 },
      { type: 'text', x: 28, y: 76, text: '方向键/WASD 移动  空格/Enter 对话', fontSize: 14, fill: '#d8f4ff' },
      { type: 'text', x: 612, y: 24, text: 'X {var.actor.hero.x}  Y {var.actor.hero.y}', fontSize: 15, fill: '#d8f4ff' }
    ];
  }

  private updateHud() {
    for (const entry of this.hudElements) {
      const item = entry.item || {};
      entry.text.text = this.resolveHudText(String(item.text || ''));
    }
  }

  private resolveHudText(text: string) {
    return text.replace(/\{([^}]+)\}/g, (_match, key) => {
      try {
        const value = this.context.stateManager?.getVariable?.(String(key).trim());
        return value == null ? '' : String(value);
      } catch {
        return '';
      }
    });
  }

  private checkZones(inst: RpgActorInstance) {
    const game = this.getGame();
    const map = (game?.rpg?.maps || []).find((m: any) => m.id === this.currentMapId);
    for (const zone of map?.zones || []) {
      if (zone.shape !== 'rect') continue;
      const isTransfer = Array.isArray(zone.tags) && zone.tags.includes('transfer');
      if (isTransfer && inst.id !== 'actor.hero') continue;
      const inside = inst.x >= zone.x && inst.x <= zone.x + zone.width && inst.y >= zone.y && inst.y <= zone.y + zone.height;
      if (!inside) continue;
      this.emit(`rpg:enter_zone:${zone.id}`, { actorId: inst.id, mapId: this.currentMapId, zoneId: zone.id });
    }
    this.checkEventObjects(inst);
  }

  private checkEventObjects(inst: RpgActorInstance) {
    if (inst.id !== 'actor.hero') return;
    const now = Date.now();
    for (const obj of this.eventObjects.values()) {
      if (obj.triggerMode !== 'touch') continue;
      const inside = Math.abs(inst.x - obj.x) <= obj.triggerWidth / 2 && Math.abs(inst.y - obj.y) <= obj.triggerHeight / 2;
      if (!inside) continue;
      if (obj.lastTouchAt && now - obj.lastTouchAt < 700) continue;
      obj.lastTouchAt = now;
      this.emitEventObject(obj, inst.id);
    }
  }

  private emitEventObject(obj: RpgEventObjectInstance, actorId: string) {
    if (obj.triggerEvent) this.emit(obj.triggerEvent, { actorId, objectId: obj.id, mapId: this.currentMapId });
    this.emit(`rpg:event_object:${obj.id}`, { actorId, objectId: obj.id, mapId: this.currentMapId });
  }

  private emit(name: string, data?: any) {
    try { this.context.eventManager?.emit?.(name, data); } catch {}
  }

  private showDialogueFor(actorId: string) {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    if (!P || !this.occlusionLayer) return;
    const game = this.getGame();
    const actor = (game?.rpg?.actors || []).find((a: any) => a.id === actorId) || {};
    const name = actor.displayName || actorId.replace(/^actor\./, '');
    const line = actor.dialogue?.previewText || (actorId === 'actor.npc.guide'
      ? '先沿着蓝色传送区域进森林，答案会在遗迹里等你。'
      : '你好，旅人。');

    if (this.dialogueBox) {
      try { this.dialogueBox.parent?.removeChild(this.dialogueBox); this.dialogueBox.destroy?.({ children: true }); } catch {}
      this.dialogueBox = undefined;
    }
    this.showDomDialogue(`${name}: ${line}`);

    const box = new P.Container();
    box.name = 'rpg.dialogueBox';
    box.zIndex = 20000;
    box.x = -Number(this.mapRoot?.x || 0);
    box.y = -Number(this.mapRoot?.y || 0);
    const bg = new P.Graphics();
    bg.beginFill(0x101820, 0.88);
    bg.lineStyle(2, 0x58d6ff, 0.88);
    bg.drawRoundedRect(32, 458, 736, 110, 8);
    bg.endFill();
    const text = new P.Text(`${name}: ${line}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 22,
      fill: 0xffffff,
      wordWrap: true,
      wordWrapWidth: 680,
      lineHeight: 30
    });
    text.x = 58;
    text.y = 486;
    box.addChild(bg, text);
    this.occlusionLayer.addChild(box);
    this.dialogueBox = box;
  }

  private showDomDialogue(text: string) {
    try {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('rpg-dialogue-dom');
      if (!el) {
        el = document.createElement('div');
        el.id = 'rpg-dialogue-dom';
        document.body.appendChild(el);
      }
      el.textContent = text;
      Object.assign(el.style, {
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        width: 'min(760px, calc(100vw - 64px))',
        minHeight: '72px',
        boxSizing: 'border-box',
        padding: '18px 22px',
        border: '2px solid rgba(88, 214, 255, 0.9)',
        borderRadius: '8px',
        background: 'rgba(16, 24, 32, 0.92)',
        color: '#fff',
        font: '20px/1.45 Arial, sans-serif',
        zIndex: '2147483000',
        pointerEvents: 'none',
        boxShadow: '0 10px 32px rgba(0,0,0,0.35)'
      } as any);
    } catch {}
  }

  private installDebugApi() {
    try {
      const g: any = window as any;
      g.__RPG_ACTIVE_WORLD__ = this;
      g.__RPG_DEBUG__ = {
        move: async (actorId = 'actor.hero', dx = 0, dy = 0, duration = 300) => {
          await this.moveActor(actorId, { x: Number(dx), y: Number(dy), relative: true, duration: Number(duration) });
          return this.snapshot();
        },
        moveTo: async (actorId = 'actor.hero', x = 0, y = 0, duration = 500) => {
          await this.moveActor(actorId, { x: Number(x), y: Number(y), duration: Number(duration) });
          return this.snapshot();
        },
        interact: (actorId = 'actor.hero', radius = 72) => {
          this.emitNearbyInteraction(actorId, Number(radius));
          return this.snapshot();
        },
        canStandAt: (x = 0, y = 0) => this.canStandAt(Number(x), Number(y)),
        screenshot: () => this.screenshot(),
        snapshot: () => this.snapshot()
      };
      if (!g.__RPG_KEYBOARD_BOUND__) {
        g.__RPG_KEYBOARD_BOUND__ = true;
        window.addEventListener('keydown', (event: KeyboardEvent) => {
          const active = g.__RPG_ACTIVE_WORLD__ || this;
          const key = event.key.toLowerCase();
          if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
            event.preventDefault();
            active.pressedKeys.add(key);
            active.startInputLoop();
          }
          if (key === ' ' || key === 'enter') { event.preventDefault(); g.__RPG_DEBUG__?.interact?.('actor.hero', 180); }
        });
        window.addEventListener('keyup', (event: KeyboardEvent) => {
          const active = g.__RPG_ACTIVE_WORLD__ || this;
          active.pressedKeys.delete(event.key.toLowerCase());
        });
        window.addEventListener('blur', () => {
          const active = g.__RPG_ACTIVE_WORLD__ || this;
          active.pressedKeys.clear();
        });
      }
    } catch {}
  }

  private startInputLoop() {
    if (this.inputLoopStarted) return;
    this.inputLoopStarted = true;
    this.lastInputFrame = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastInputFrame) / 1000));
      this.lastInputFrame = now;
      this.updateHeldInput(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private updateHeldInput(dt: number) {
    const hero = this.actors.get('actor.hero');
    if (!hero) return;
    let dx = 0;
    let dy = 0;
    if (this.pressedKeys.has('arrowleft') || this.pressedKeys.has('a')) dx -= 1;
    if (this.pressedKeys.has('arrowright') || this.pressedKeys.has('d')) dx += 1;
    if (this.pressedKeys.has('arrowup') || this.pressedKeys.has('w')) dy -= 1;
    if (this.pressedKeys.has('arrowdown') || this.pressedKeys.has('s')) dy += 1;
    if (!dx && !dy) {
      if (hero.moving && !this.movingActors.has(hero.id)) this.setDirection(hero, hero.direction, false);
      return;
    }
    if (dx && dy) {
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }
    const speed = 132;
    const nextX = hero.x + dx * speed * dt;
    const nextY = hero.y + dy * speed * dt;
    const direction = this.directionForDelta(dx, dy);
    this.setDirection(hero, direction, true);
    if (this.canStandAt(nextX, nextY)) {
      hero.x = nextX;
      hero.y = nextY;
    } else if (this.canStandAt(nextX, hero.y)) {
      hero.x = nextX;
    } else if (this.canStandAt(hero.x, nextY)) {
      hero.y = nextY;
    } else {
      this.emit(`rpg:collision:${hero.id}`, { actorId: hero.id, x: nextX, y: nextY, mapId: this.currentMapId });
    }
    this.applyActorPosition(hero);
    this.writeActorState(hero.id, hero.x, hero.y, hero.direction);
    this.checkZones(hero);
  }

  private snapshot() {
    const actors: any = {};
    for (const [id, actor] of this.actors.entries()) {
      const sprite = actor.sprite;
      const screenX = (this.mapRoot?.x || 0) + actor.x;
      const screenY = (this.mapRoot?.y || 0) + actor.y;
      actors[id] = {
        x: Math.round(actor.x),
        y: Math.round(actor.y),
        direction: actor.direction,
        screenX: Math.round(screenX),
        screenY: Math.round(screenY),
        spriteVisible: !!sprite?.visible,
        spriteRenderable: sprite?.renderable !== false,
        spriteAlpha: sprite?.worldAlpha ?? sprite?.alpha ?? null,
        textureValid: !!sprite?.texture?.valid,
        markerVisible: !!actor.marker?.visible
      };
    }
    const app = (this.context.renderManager as any)?.getApp?.();
    const viewport = this.viewportSize();
    return {
      currentMapId: this.currentMapId,
      camera: this.mapRoot ? { x: Math.round(this.mapRoot.x), y: Math.round(this.mapRoot.y) } : null,
      viewport,
      renderer: {
        width: Number(app?.renderer?.width || 0),
        height: Number(app?.renderer?.height || 0),
        resolution: Number(app?.renderer?.resolution || 1)
      },
      hud: {
        visible: !!this.hudLayer?.visible,
        children: Number(this.hudLayer?.children?.length || 0)
      },
      dialogue: this.dialogueBox ? {
        visible: !!this.dialogueBox.visible,
        x: Math.round(this.dialogueBox.x || 0),
        y: Math.round(this.dialogueBox.y || 0),
        parent: this.dialogueBox.parent?.name || '',
        children: this.dialogueBox.children?.length || 0,
        domVisible: typeof document !== 'undefined' ? !!document.getElementById('rpg-dialogue-dom') : false
      } : null,
      actors
    };
  }

  private screenshot(): string | null {
    try {
      const app = (this.context.renderManager as any)?.getApp?.();
      const canvas = app?.renderer?.extract?.canvas ? app.renderer.extract.canvas(app.stage) : app?.view;
      return canvas?.toDataURL?.('image/png') || null;
    } catch {
      return null;
    }
  }

  private updateCamera() {
    if (!this.mapRoot || this.camera.mode !== 'follow_actor' || !this.camera.targetActorId) return;
    const target = this.actors.get(this.camera.targetActorId);
    if (!target) return;
    const { width: vw, height: vh } = this.viewportSize();
    let x = Math.round(vw / 2 - target.x);
    let y = Math.round(vh / 2 - target.y);
    if (this.camera.clampToMap && this.currentMapSize.width > 0 && this.currentMapSize.height > 0) {
      x = Math.min(0, Math.max(vw - this.currentMapSize.width, x));
      y = Math.min(0, Math.max(vh - this.currentMapSize.height, y));
    }
    this.mapRoot.x = x;
    this.mapRoot.y = y;
    this.updateDomRoot();
    this.updateDomActors();
    this.updateDomZones();
  }

  private clearMapElements() {
    for (const item of this.mapElements.splice(0)) {
      if (typeof item === 'string') {
        try { (this.context.renderManager as any)?.removeElement?.(item); } catch {}
      } else {
        try { item.parent?.removeChild(item); item.destroy?.(); } catch {}
      }
    }
    for (const inst of this.actors.values()) {
      if (inst.behaviorTimer) clearInterval(inst.behaviorTimer);
    }
    this.movingActors.clear();
    this.actors.clear();
    this.eventObjects.clear();
    this.clearDomOverlays();
    this.passabilityCanvas = undefined;
    try { this.mapRoot?.parent?.removeChild(this.mapRoot); this.mapRoot?.destroy?.({ children: true }); } catch {}
    this.mapRoot = undefined;
    this.baseLayer = undefined;
    this.actorLayer = undefined;
    this.lightLayer = undefined;
    this.occlusionLayer = undefined;
    try { this.dialogueLayer?.parent?.removeChild(this.dialogueLayer); this.dialogueLayer?.destroy?.({ children: true }); } catch {}
    this.dialogueLayer = undefined;
    this.dialogueBox = undefined;
  }

  private createMapContainers() {
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    const stage = rm?.getStage?.();
    if (!P || !stage) return;
    stage.sortableChildren = true;
    this.mapRoot = new P.Container();
    this.mapRoot.sortableChildren = true;
    this.mapRoot.name = 'rpg.mapRoot';
    this.mapRoot.zIndex = 0;
    this.baseLayer = new P.Container();
    this.actorLayer = new P.Container();
    this.lightLayer = new P.Container();
    this.occlusionLayer = new P.Container();
    this.baseLayer.zIndex = 0;
    this.actorLayer.zIndex = 5000;
    this.lightLayer.zIndex = 9000;
    this.occlusionLayer.zIndex = 10000;
    this.actorLayer.sortableChildren = true;
    this.occlusionLayer.sortableChildren = true;
    this.mapRoot.addChild(this.baseLayer, this.actorLayer, this.lightLayer, this.occlusionLayer);
    stage.addChild(this.mapRoot);
    this.dialogueLayer = new P.Container();
    this.dialogueLayer.name = 'rpg.dialogueLayer';
    this.dialogueLayer.zIndex = 20000;
    stage.addChild(this.dialogueLayer);
  }

  private addImageLayer(container: any, layer: any, size: any, defaultAlpha: number, blendMode: 'normal' | 'add') {
    if (!container || !layer?.resourceId) return;
    const rm: any = this.context.renderManager as any;
    const P = rm?.getPixi?.();
    if (!P) return;
    const sprite = new P.Sprite(P.Texture.from(this.resourceUrl(layer.resourceId)));
    sprite.x = 0;
    sprite.y = 0;
    sprite.width = Number(size?.width || 0) || sprite.width;
    sprite.height = Number(size?.height || 0) || sprite.height;
    sprite.alpha = layer.opacity != null ? Number(layer.opacity) : defaultAlpha || 1;
    if (blendMode === 'add') sprite.blendMode = P.BLEND_MODES?.ADD ?? sprite.blendMode;
    container.addChild(sprite);
    this.mapElements.push(sprite);
  }

  private loadPassabilityMask(resourceId?: string) {
    this.passabilityCanvas = undefined;
    if (!resourceId || typeof document === 'undefined') return;
    const url = this.resourceUrl(resourceId);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        this.passabilityCanvas = canvas;
      } catch {}
    };
    img.src = url;
  }

  canStandAt(x: number, y: number): boolean {
    if (this.currentMapSize.width > 0 && this.currentMapSize.height > 0) {
      if (x < 0 || y < 0 || x >= this.currentMapSize.width || y >= this.currentMapSize.height) return false;
    }
    if (!this.passabilityCanvas) return true;
    try {
      const cx = Math.max(0, Math.min(this.passabilityCanvas.width - 1, Math.round(x)));
      const cy = Math.max(0, Math.min(this.passabilityCanvas.height - 1, Math.round(y)));
      const data = this.passabilityCanvas.getContext('2d')?.getImageData(cx, cy, 1, 1).data;
      if (!data) return true;
      const [r, g, b, a] = data;
      if (a === 0) return true;
      if (r < 20 && g < 20 && b < 20) return false;
      if (r > 180 && g < 100 && b < 100) return false;
    } catch {}
    return true;
  }
}
