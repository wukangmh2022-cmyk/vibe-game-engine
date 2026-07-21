---
name: game-trajectory-distillation
description: Generate verified reasoning-action trajectory batches for Vibe Game Engine from existing JSON scenes, resources, commands, and runtime feedback. Use when creating teacher-model distillation data, selecting representative existing levels, defining trajectory categories, or producing JSONL training traces for the Vibe Game Engine agent.
---

# Game Trajectory Distillation

Generate tool-grounded training data for a constrained JSON game agent. A trajectory is an episode of observations, short evidence-based decisions, actions, and validation. It is not a static scene JSON and is not identical to one level.

## Project Sources

Set `PROJECT_ROOT` to the Vibe Game Engine repository. Default to `/Users/pippo/github-repo/vibe-game-engine` when it exists.

Treat these as authoritative before generating a batch:

- `level-editor/src/guides/promptGuideInline.ts`: authoring rules.
- `level-editor/src/utils/commandTemplates.ts`: editor-supported command templates and defaults.
- `src/commands/factory.ts` and `src/browser/bootstrap.ts`: runtime-supported behavior and redirects.
- `src/types/index.ts`: runtime resource contract, including optional resource metadata.
- `customer-demo/config.json` and `customer-demo/scene/*.json`: real project examples.

Read [references/retrieval-map.md](references/retrieval-map.md) before selecting tasks. Read [references/trajectory-schema.md](references/trajectory-schema.md) before writing output.

## Workflow

1. Record the current Git commit. Work in an isolated temporary copy or detached worktree. Never modify, commit, or push the source project.
2. Index actual resources and scenes. Normalize every resource into `{ id, type, path, origin, exists, metadata }`.
3. Select a category and a relevant real scene fragment using the retrieval map. Use the fragment as a reference, not as an answer to copy.
4. Derive one concrete user task. Prefer a single level; allow at most two scene files for flow tasks.
5. Execute a bounded loop: inspect -> short decision -> action -> real observation. Limit accepted trajectories to 3-12 actions.
6. Validate JSON parsing, command support, resource references, `npm run build`, and `npm test -- --runInBand`.
7. Write only accepted trajectories. Do not claim runtime validation unless it was actually run.

## Resource Rules

Use `origin: "existing"` only for a resource found on disk. Allow invented paths only as explicit virtual assets with `origin: "virtual"`, `exists: false`, and `metadata.status: "placeholder"`. A virtual asset may support planning and layout but cannot pass a production release gate.

Do not invent a real-looking resource id or path and report it as existing.

## Reasoning Rules

Use a compact `decision` object before every action:

```json
{
  "goal": "...",
  "evidence": "...",
  "hypothesis": "...",
  "verification": "..."
}
```

Keep each field factual and short. Do not write lengthy chain-of-thought. Ground evidence in files, tool output, or runtime state.

## Batch Requirements

Generate exactly 10 accepted JSONL records per batch. Include at least one create, modify, interaction, state/logic, scene-flow, repair, resource/layout, and validation task; use the remaining two records to balance the current corpus category counts.

Record failed attempts only in a separate internal log. Keep an accepted repair trajectory only when it contains a real failing observation followed by a verified correction.

## Output

Write `training-data/agent-trajectories/batches/<batch-id>.jsonl` and a matching manifest. Validate every output line as JSON. Use the schema reference exactly.
