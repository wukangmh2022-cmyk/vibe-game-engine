/* Minimal Pixi-based renderer to preview adventure-choice-game-v2.json */
(function() {
  const appEl = document.getElementById('app');
  const overlay = document.getElementById('overlay');

  // Create Pixi App
  const app = new PIXI.Application({ width: 800, height: 600, backgroundColor: 0x000000, antialias: true });
  appEl.prepend(app.view);
  app.stage.sortableChildren = true;

  // Helpers
  function prefixIfNeeded(url) {
    if (!url) return url;
    if (url.startsWith('http') || url.startsWith('/') || url.startsWith('../')) return url;
    return '../' + url.replace(/^\.\//, '');
  }

  // Simple event bus
  const bus = {
    _m: new Map(),
    on(e, fn) { if (!this._m.has(e)) this._m.set(e, []); this._m.get(e).push(fn); },
    once(e, fn) { const wrap = (d) => { off(); fn(d); }; const off = () => this.off(e, wrap); this.on(e, wrap); },
    off(e, fn) { const arr = this._m.get(e) || []; const i = arr.indexOf(fn); if (i>=0) arr.splice(i,1); },
    emit(e, d) { const arr = (this._m.get(e) || []).slice(); arr.forEach(fn => { try { fn(d); } catch(_){} }); }
  };

  const sprites = new Map();
  const dropZones = new Map();

  function loadImageSprite(url, opts) {
    const texture = PIXI.Texture.from(prefixIfNeeded(url));
    const sprite = new PIXI.Sprite(texture);
    sprite.x = opts.x || 0;
    sprite.y = opts.y || 0;
    if (opts.width && opts.height) { sprite.width = opts.width; sprite.height = opts.height; }
    sprite.zIndex = opts.zIndex || 0;
    return sprite;
  }

  function addText(id, text, style, x, y, cls) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'text ' + (cls || '');
    el.textContent = text;
    el.style.left = (x||0) + 'px';
    el.style.top = (y||0) + 'px';
    if (style) Object.assign(el.style, style);
    overlay.appendChild(el);
    return el;
  }

  async function main() {
    // Load JSON
    const res = await fetch('../adventure-choice-game-v2.json');
    const json = await res.json();

    const level = json.levels[0];

    // Background image (using resources mapping in JSON)
    const resMap = Object.fromEntries(json.resources.images.map(img => [img.id, img.src]));

    // Simple state from initialState
    const state = { ...(level.initialState || {}) };

    // Tiny command runner for demo
    async function runCommands(list) {
      if (!Array.isArray(list)) return;
      for (const c of list) {
        await runCommand(c);
      }
    }

    function evalExpression(expr, event) {
      try {
        const context = { stateManager: { getVariable: (k) => state[k] } };
        // eslint-disable-next-line no-new-func
        const fn = new Function('context', 'state', 'event', `return (${expr});`);
        return !!fn(context, state, event);
      } catch (e) {
        console.warn('Eval expression failed:', expr, e);
        return false;
      }
    }

    function interp(text) {
      if (typeof text !== 'string') return text;
      return text.replace(/\$\{([^}]+)\}/g, (_, path) => {
        const parts = path.split('.');
        let v = parts[0] === 'gameState' ? state : (state[parts[0]] !== undefined ? state : undefined);
        if (v === undefined && parts[0] === 'state') v = state;
        for (let i = (parts[0] === 'gameState' || parts[0] === 'state') ? 1 : 1; i < parts.length; i++) {
          v = v != null ? v[parts[i]] : undefined;
        }
        return v != null ? String(v) : '';
      });
    }

    function updateStats() {
      const el = document.getElementById('stats-display');
      if (el) {
        el.textContent = `💰 金币: ${state.gold} | ❤️ 生命: ${state.health} | ⭐ 得分: ${state.score}`;
      }
    }

    async function runCommand(cmd) {
      const type = String(cmd.type).toUpperCase();
      const p = cmd.parameters || {};
      if (type === 'UPDATE_TEXT') {
        const el = document.getElementById(p.elementId || cmd.id);
        if (el) el.textContent = interp(p.text || '');
        return;
      }
      if (type === 'SET_VARIABLE' || type === 'set_variable'.toUpperCase()) {
        const key = p.key || p.name;
        if (!key) return;
        if (p.expression && typeof p.value === 'string') {
          // evaluate expression with state
          try {
            // eslint-disable-next-line no-new-func
            const fn = new Function('state', `return (${p.value.replace(/gameState\./g, 'state.')});`);
            state[key] = fn(state);
          } catch {
            // fallback: keep old
          }
        } else {
          state[key] = p.value;
        }
        updateStats();
        return;
      }
      if (type === 'SET_ELEMENT_STYLE') {
        const el = document.getElementById(p.elementId);
        if (el && p.style) Object.assign(el.style, p.style);
        const sprite = sprites.get(p.elementId);
        if (sprite && p.style && p.style.display === 'none') { app.stage.removeChild(sprite); sprites.delete(p.elementId); }
        return;
      }
      if (type === 'IF_CONDITION') {
        const cond = p.condition || {};
        const ok = cond.type === 'expression' ? evalExpression(cond.expression || '') : false;
        if (ok) await runCommands(p.trueCommands || []); else await runCommands(p.falseCommands || []);
        return;
      }
      if (type === 'SHOW_IMAGE') {
        const textureUrl = p.src || resMap[p.resourceId];
        if (!textureUrl) return;
        const sprite = loadImageSprite(textureUrl, {
          x: (p.position && p.position.x) || 0,
          y: (p.position && p.position.y) || 0,
          width: (p.size && p.size.width) || undefined,
          height: (p.size && p.size.height) || undefined,
          zIndex: p.zIndex || 0
        });
        app.stage.addChild(sprite);
        if (p.elementId) sprites.set(p.elementId, sprite);
        return;
      }
      if (type === 'WAIT') {
        const ms = Number(p.duration || 0);
        await new Promise(r => setTimeout(r, ms));
        return;
      }
      if (type === 'EMIT_SIGNAL') {
        const sig = p.signal;
        bus.emit(sig, p.data);
        return;
      }
      if (type === 'CREATE_DROP_ZONE') {
        const id = p.dropZoneId;
        const rect = { x: p.position?.x||0, y: p.position?.y||0, w: p.size?.width||0, h: p.size?.height||0, accept: (p.acceptTypes||[]).slice() };
        dropZones.set(id, rect);
        // Optional visual hint
        const g = new PIXI.Graphics();
        g.alpha = 0.001; // keep interactive to allow pointer events pass-through
        g.beginFill(0x00ff00).drawRect(rect.x, rect.y, rect.w, rect.h).endFill();
        app.stage.addChild(g);
        return;
      }
      if (type === 'SET_DRAGGABLE') {
        const elId = p.elementId; const dragType = p.dragType;
        const sp = sprites.get(elId); if (!sp) return;
        sp.eventMode = 'static'; sp.cursor = 'grab'; sp.dragType = dragType;
        let dragging = false; let offset = {x:0,y:0};
        sp.on('pointerdown', (e) => { dragging = true; sp.cursor='grabbing'; const pos = e.data.getLocalPosition(sp.parent); offset.x = pos.x - sp.x; offset.y = pos.y - sp.y; });
        sp.on('pointerup', () => { if (!dragging) return; dragging=false; sp.cursor='grab';
          // hit drop zones
          const cx = sp.x + sp.width/2; const cy = sp.y + sp.height/2;
          for (const [dzId, r] of dropZones) {
            if (cx>=r.x && cx<=r.x+r.w && cy>=r.y && cy<=r.y+r.h) {
              bus.emit('drop:success', { dropZoneId: dzId, draggedElementId: elId, dragType: sp.dragType });
              break;
            }
          }
        });
        sp.on('pointerupoutside', () => { dragging=false; sp.cursor='grab'; });
        sp.on('pointermove', (e) => { if (!dragging) return; const pos = e.data.getLocalPosition(sp.parent); sp.x = pos.x - offset.x; sp.y = pos.y - offset.y; });
        return;
      }
    }

    // We will defer rendering of CHOICES until user clicks "是"
    let deferredChoicesCmd = null;

    // Render initial commands subset: SHOW_IMAGE background, SHOW_TEXT title/story/stats, BUTTON
    for (const cmd of level.commands) {
      const type = String(cmd.type).toUpperCase();
      if (type === 'SHOW_IMAGE') {
        const p = cmd.parameters || {};
        const textureUrl = p.src || resMap[p.resourceId];
        if (!textureUrl) continue;
        const sprite = loadImageSprite(textureUrl, {
          x: (p.position && p.position.x) || 0,
          y: (p.position && p.position.y) || 0,
          width: (p.size && p.size.width) || undefined,
          height: (p.size && p.size.height) || undefined,
          zIndex: p.zIndex || 0
        });
        app.stage.addChild(sprite);
      }
      if (type === 'SHOW_TEXT') {
        const p = cmd.parameters || {};
        const pos = p.position || {};
        addText(p.elementId || cmd.id, p.text || '', p.style, pos.x, pos.y, p.elementId === 'game-title' ? 'title' : (p.elementId === 'stats-display' ? 'stats' : 'story'));
      }
      if (type === 'BUTTON') {
        // Render as two DOM buttons (yes/no) under the story text area
        const p = cmd.parameters || {};
        const pos = p.position || { x: 100, y: 200 };
        const wrap = document.createElement('div');
        wrap.style.position = 'absolute';
        wrap.style.left = (pos.x || 100) + 'px';
        wrap.style.top = (pos.y || 200) + 'px';
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.pointerEvents = 'auto';
        overlay.appendChild(wrap);
        const yes = document.createElement('button');
        yes.className = 'choice-btn';
        yes.textContent = (cmd.branches && cmd.branches.yes && cmd.branches.yes.label) || '是';
        const no = document.createElement('button');
        no.className = 'choice-btn';
        no.textContent = (cmd.branches && cmd.branches.no && cmd.branches.no.label) || '否';
        wrap.appendChild(yes);
        wrap.appendChild(no);
        const renderChoices = (choicesCmd) => {
          if (!choicesCmd) return;
          const pp = choicesCmd.parameters || {};
          const opts = choicesCmd.options || [];
          const choices = document.createElement('div');
          choices.className = 'choices';
          const title = document.createElement('div');
          title.textContent = pp.text || '选择你的道路：';
          title.style.marginBottom = '6px';
          choices.appendChild(title);
          for (const opt of opts) {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = opt.text || opt.id;
            btn.onclick = () => {
              runCommands(opt.commands || []);
              choices.remove();
            };
            choices.appendChild(btn);
          }
          overlay.appendChild(choices);
        };

        yes.onclick = () => {
          // On yes: update story and stats as a demo
          const yesCmds = (cmd.branches && cmd.branches.yes && cmd.branches.yes.commands) || [];
          runCommands(yesCmds);
          wrap.remove();
          // After user confirms entering the forest, render deferred CHOICES
          if (deferredChoicesCmd) {
            renderChoices(deferredChoicesCmd);
            deferredChoicesCmd = null;
          }
        };
        no.onclick = () => wrap.remove();
      }
      if (type === 'CHOICES') {
        // Defer rendering until the user clicks YES on the question button
        deferredChoicesCmd = cmd;
      }
    }

    // Register level events
    for (const ev of level.events || []) {
      for (const tr of ev.triggers || []) {
        if (tr.type === 'auto' && tr.start === 'immediate') {
          // run async
          runCommands(ev.commands);
        }
        if (tr.type === 'custom' && tr.target) {
          bus.on(tr.target, () => runCommands(ev.commands));
        }
        if (tr.type === 'custom' && tr.condition && tr.condition.type === 'expression') {
          const m = /event\.type\s*===\s*'([^']+)'/.exec(tr.condition.expression || '');
          if (m) {
            const name = m[1];
            bus.on(name, (eventData) => {
              if (evalExpression(tr.condition.expression, { type: name, ...eventData })) {
                runCommands(ev.commands);
              }
            });
          }
        }
      }
    }
  }

  main().catch(console.error);
})();
