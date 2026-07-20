# 雾瀑边境 Demo Resource Folder

This folder was generated with `$rpg-asset-protocol`.

## Contents

- `script.json`: normalized story, maps, actors, and progression.
- `production-plan.json`: assumptions, stages, map graph, and actors.
- `assets.json`: resource generation queue.
- `config.json`: Vibe project entry config.
- `scene/entry.json`: Vibe Game Engine-style config plus `rpg-image-map-1.0` extension.
- `prompts/`: prompt files for map base layers, overlays, masks, and walk sheets.
- `assets/`: placeholder materialized files, ready to be replaced by real generated images.

## Current Status

- Protocol validation: passed.
- Placeholder assets: generated.
- Real GPT image calls: not run because `OPENAI_API_KEY` is not currently set.
- Runtime location: `/Users/pippo/github-repo/vibe-game-engine/examples/rpg/mistfall-border`.

## Run In Vibe Game Engine

From `/Users/pippo/github-repo/vibe-game-engine` on branch `rpg`:

```bash
npm run build:web
npm start
```

Open:

```text
http://localhost:8080/level-editor/public/run.html?base=/examples/rpg/mistfall-border/
```

The runtime exposes `window.__RPG_DEBUG__` for screenshots, movement, and interaction checks.

## Configure Real Image Generation

Create a private env file:

```bash
cp /Users/pippo/.codex/skills/rpg-asset-protocol/config/rpg-asset-protocol.env.example ~/.codex/rpg-asset-protocol.env
chmod 600 ~/.codex/rpg-asset-protocol.env
```

Edit `~/.codex/rpg-asset-protocol.env`:

```bash
OPENAI_API_KEY="your_key_here"
OPENAI_BASE_URL="https://your-third-party-openai-compatible-url/v1"
RPG_IMAGE_MODEL="gpt-image-2"
RPG_IMAGE_QUALITY="high"
RPG_IMAGE_SIZE_MAP="2048x2048"
RPG_IMAGE_SIZE_SPRITE="1024x1024"
```

Do not commit this env file.

## Dry Run

```bash
python /Users/pippo/.codex/skills/rpg-asset-protocol/scripts/run_asset_generation_queue.py \
  --project /Users/pippo/github-repo/vibe-game-engine/examples/rpg/mistfall-border \
  --env ~/.codex/rpg-asset-protocol.env \
  --dry-run
```

## Real Generation

```bash
python /Users/pippo/.codex/skills/rpg-asset-protocol/scripts/run_asset_generation_queue.py \
  --project /Users/pippo/github-repo/vibe-game-engine/examples/rpg/mistfall-border \
  --env ~/.codex/rpg-asset-protocol.env \
  --force
```

The queue uses:

- `generate` for map base images.
- `edit` for overlay light, overlay occlusion, passability masks, and character walk sheets.

## Validate

```bash
python /Users/pippo/.codex/skills/rpg-asset-protocol/scripts/validate_rpg_protocol.py \
  /Users/pippo/github-repo/vibe-game-engine/examples/rpg/mistfall-border/scene/entry.json
```
