# DSL V2 repair workspace

This directory is independent from `training/qlora/data/level-authoring-dsl-v1`.
The V1 train, validation, converted, and manifest files are read-only inputs.

Files created by the initializer:

- `pending.jsonl`: all rechecked `STILL_BAD` rows with the current intent, assets, DSL, and manual reason.
- `repairs.jsonl`: explicit decisions, one per pending source ID.
- `manifest.json`: immutable workspace counts and source paths.

Each repair row must be either:

```json
{"source_id":"...","action":"FIX","intent":"...","asset_catalog":[],"dsl":"...","reason":"..."}
```

or:

```json
{"source_id":"...","action":"EXCLUDE","reason":"The request cannot be implemented without inventing missing information."}
```

`intent` and `asset_catalog` may be omitted for a FIX when unchanged. The V2 builder refuses to emit a dataset until every pending row is explicitly resolved and every retained DSL passes compile, round-trip, and static checks.

Commands:

```bash
python training/qlora/prepare_rechecked_dsl_data.py init
python training/qlora/prepare_rechecked_dsl_data.py build
```

The completed dataset is written to `training/qlora/data/level-authoring-dsl-v2`; V1 is never overwritten.
