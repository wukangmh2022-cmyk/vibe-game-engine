# RPG Image-Map Runtime

Branch: `rpg`

Remote:

`https://github.com/wukangmh2022-cmyk/vibe-game-engine`

## What This Adds

The existing engine remains useful for UI-heavy quiz games: text boxes, choices, buttons, images, variables, switches, and scene flow still work.

The RPG path adds a separate image-map runtime layer:

- `rpg_load_image_map`: load full-image map layers.
- `rpg_set_actor`: create/place a hero, NPC, or monster sprite.
- `rpg_move_actor`: move an actor up/down/left/right or to a point.
- `rpg_transfer_actor`: move actor to another map/spawn point.
- `rpg_set_actor_behavior`: `idle`, `wander`, or `patrol`.
- `rpg_set_camera`: follow an actor and clamp to map bounds.
- `rpg_emit_nearby_interaction`: emit `rpg:talk:<actorId>` for nearby NPCs.
- `rpg_check_passability`: sample the loaded mask at a point.

## Layer Model

The RPG renderer does not treat maps as tilemaps. A map is one complete image plus aligned data layers:

- `base`: full-color map, under everything.
- `actorLayer`: hero/NPC/monster animated sprites.
- `overlayLight`: additive light/shadow overlay.
- `overlayOcclusion`: semi-transparent foreground layer above actors, such as treetops, roof eaves, rails, mist, and tall grass.
- `passabilityMask`: logic mask. Black and blue are currently treated as blocked.

This keeps the quiz UI renderer separate from RPG map/sprite rendering.

## Local Test

From the engine repo:

```bash
cd /Users/pippo/github-repo/vibe-game-engine
npm run build:web
npm start
```

Open:

```text
http://localhost:8080/level-editor/public/run.html?base=/examples/rpg/mistfall-border/
```

The example package lives at:

`examples/rpg/mistfall-border`

It contains:

- `config.json`
- `scene/entry.json`
- `assets/maps/*`
- `assets/characters/*`
- `prompts` and planning JSON copied from the generator output

## Runtime Debug API

When an RPG map has loaded, the browser exposes:

```js
window.__RPG_DEBUG__.snapshot()
window.__RPG_DEBUG__.screenshot()
await window.__RPG_DEBUG__.move('actor.hero', 64, 0)
await window.__RPG_DEBUG__.moveTo('actor.hero', 1024, 1400)
window.__RPG_DEBUG__.interact('actor.hero', 96)
```

This is intentionally small. It is meant for Codex/Playwright regression tests: move the actor, take screenshots, then compare whether map transitions and rendering still work.

## Manual Controls

When the RPG runtime is active:

- Arrow keys or `WASD`: move `actor.hero` by one 64px step.
- `Space` or `Enter`: trigger nearby interaction.

## Current Limits

- Passability mask support is basic pixel sampling: black/blue block movement.
- No A* pathfinding yet. NPCs support simple `wander` and waypoint `patrol`.
- Transfer currently loads another image map inside the same runtime session. Scene-level remount can be added later if each map becomes a separate scene JSON.
- Character sprites use the unified walk-only contract.

## Resource Package Contract

A generated RPG package should include:

```text
config.json
scene/entry.json
assets/
  maps/<map-id>/base.png
  maps/<map-id>/overlay_light.png
  maps/<map-id>/overlay_occlusion.png
  maps/<map-id>/mask.png
  maps/<map-id>/objects.json
  characters/<actor-id>/walk.png
```

Generated packages can be tested by copying them under `examples/rpg/<name>/` and opening:

```text
http://localhost:8080/level-editor/public/run.html?base=/examples/rpg/<name>/
```
