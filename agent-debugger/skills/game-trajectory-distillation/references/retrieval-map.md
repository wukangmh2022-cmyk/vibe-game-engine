# Retrieval Map

Use `rg -n -i` inside `customer-demo/scene` before selecting a task. Read only the matching local scene fragments plus their resource lists.

| Category | Search terms | Typical reference use |
|---|---|---|
| Display and layout | `SHOW_IMAGE|SHOW_TEXT|SHOW_BUTTON|zIndex|position|size` | Asset placement, layering, canvas bounds |
| Choices and interaction | `SHOW_CHOICES|SET_CLICKABLE|SET_SELECTABLE|onClick|onSelected` | Choice flow and click actions |
| Variables and logic | `SET_VARIABLE|SET_SWITCH|IF_CONDITION|LOOP|ADD_SCORE` | State, scoring, conditions, win/lose rules |
| Drag and drop | `SET_DRAGGABLE|CREATE_DROP_ZONE|CHECK_DROP_ZONE|CHECK_IN_AREA` | Object matching and area validation |
| Cards and memory | `FLIP_CARD|SET_SELECTED|CHANGE_SELECT_STATE` | Card state and matching mechanics |
| Scene and level flow | `SCENE_REDIRECT|NEXT_LEVEL|RETURN|scene-tree|levelIndex` | Retry, navigation, unlock, multi-scene flow |
| Audio and pacing | `BGM_PLAY|SE_PLAY|WAIT|SET_VOLUME` | Sound, timing, feedback |
| Repair tasks | `resourceId|soundId|scene_redirect|this|zIndex|elementId` | Missing assets, bad redirects, wrong IDs, layering |

Inspect runtime support with:

```bash
rg -n "readonly type|registerHandler" src/commands src/browser src/rpg
```

Build the asset index from both formats found in projects:

- Scene `resources` arrays or grouped `resources.images/audios/animations/videos`.
- Project `config.json` `skins` entries.
- Level `resources` id lists.

Do not rely only on filenames. Record image dimensions when available and retain the resource id used by commands.

## Corpus Split

Reserve whole mini-games, including their scenes and resources, before generation:

- 7 mini-games: train source material.
- 1 mini-game: validation source material.
- 2 mini-games: final held-out evaluation source material.

Do not use held-out game fragments as teacher references for SFT trajectories.
