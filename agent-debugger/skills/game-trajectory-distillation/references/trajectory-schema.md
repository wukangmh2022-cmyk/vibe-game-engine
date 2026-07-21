# Trajectory Output Schema

Write one JSON object per line. Required top-level fields:

```json
{
  "schema_version": "v1",
  "trajectory_id": "batch-001-001",
  "status": "accepted",
  "base_commit": "git commit hash",
  "task": {
    "category": "create|modify|interaction|state_logic|scene_flow|repair|resource_layout|validation",
    "user_request": "concrete natural-language request",
    "scope": { "scene_paths": ["scene/example.json"], "level_ids": ["level-1"] },
    "tags": ["SHOW_CHOICES", "IF_CONDITION"]
  },
  "initial_state": {
    "relevant_files": [{ "path": "scene/example.json", "content": "complete pre-change JSON" }],
    "asset_index": []
  },
  "turns": [
    {
      "turn": 1,
      "decision": { "goal": "", "evidence": "", "hypothesis": "", "verification": "" },
      "action": { "name": "read_file", "arguments": { "path": "scene/example.json" } },
      "observation": { "status": "ok", "summary": "real concise result" }
    }
  ],
  "final_patch": [{ "path": "scene/example.json", "format": "rfc6902", "operations": [] }],
  "final_state": { "relevant_files": [{ "path": "scene/example.json", "content": "complete post-change JSON" }] },
  "verification": {
    "json_valid": true,
    "command_support_valid": true,
    "resource_paths_valid": true,
    "build": { "status": "passed", "evidence": "actual output summary" },
    "tests": { "status": "passed", "evidence": "actual output summary" },
    "runtime_validation": { "status": "passed|not_run", "evidence": "actual result or reason" }
  },
  "outcome": { "success": true, "summary": "", "changed_files": ["scene/example.json"] },
  "lineage": { "gold_seed_id": "optional", "derivation": "optional" }
}
```

The manifest must include `batch_id`, `base_commit`, `accepted_count: 10`, category counts, trajectory ids, and output validation status.

Use RFC 6902 operations in `final_patch`. Store full initial and final relevant scene content so the training preprocessor can rebuild turn contexts without depending on the live repository.
