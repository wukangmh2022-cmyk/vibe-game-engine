# Vibe Game Engine Trajectory Synthesis

You are generating one verified reasoning-action trajectory batch for Vibe Game Engine.

Episode context:

```json
{{EPISODE_CONTEXT}}
```

Read these files before acting:

1. `agent-debugger/skills/game-trajectory-distillation/SKILL.md`
2. `agent-debugger/skills/game-trajectory-distillation/references/retrieval-map.md`
3. `agent-debugger/skills/game-trajectory-distillation/references/trajectory-schema.md`
4. `agent-debugger/state/project-index.json` when present; regenerate it with `python3 agent-debugger/debug_project.py` when stale.

Generate exactly 10 accepted trajectories. Work in isolated temporary copies. Do not modify engine source, the customer demo, the current branch, commits, or remote state.

Use real scene fragments and resource ids as references. Virtual resource paths are allowed only when represented in each trajectory asset index as `origin: "virtual"`, `exists: false`, and `metadata.status: "placeholder"`.

Each trajectory must contain a bounded inspect -> decision -> action -> observation loop, a full initial and final relevant JSON state, RFC 6902 patch data, and real build/test evidence. Do not invent tool output or claim runtime validation that did not occur.

Write output to:

```text
training-data/agent-trajectories/batches/{{EPISODE_ID}}.jsonl
training-data/agent-trajectories/batches/{{EPISODE_ID}}.manifest.json
```

Before ending, update only the current episode object in `agent-debugger/progress.json`.

Success update:

```json
{
  "episode_id": "{{EPISODE_ID}}",
  "status": "success",
  "result": {
    "jsonl": "training-data/agent-trajectories/batches/{{EPISODE_ID}}.jsonl",
    "manifest": "training-data/agent-trajectories/batches/{{EPISODE_ID}}.manifest.json",
    "accepted_count": 10
  },
  "summary": "short factual result",
  "next_focus": "one allowed category for the next episode"
}
```

Failure update:

```json
{
  "episode_id": "{{EPISODE_ID}}",
  "status": "failed",
  "error": "specific blocker and evidence",
  "summary": "what requires human review"
}
```

Allowed `next_focus` values:

```text
create, modify, interaction, state_logic, scene_flow, repair, resource_layout, validation
```

Never mark success when JSONL or manifest is absent, malformed, contains anything other than 10 accepted records, or validation did not pass. After updating progress, stop immediately.
