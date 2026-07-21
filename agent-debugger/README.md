# Agent Debugger

This is a local, text-only controller for producing verified trajectory batches. It does not store API keys and does not automatically call a teacher API.

```bash
python3 agent-debugger/distill.py init --api-base http://127.0.0.1:8000/v1 --model teacher-model --runner manual
python3 agent-debugger/distill.py debug
python3 agent-debugger/distill.py run --rounds 100
```

Each episode writes a prompt under `agent-debugger/runs/`. After a coding agent completes a batch, it must update `agent-debugger/progress.json` with the matching `episode_id` and `success` or `failed` status. Success unlocks the next prompt only after the script validates 10 accepted JSONL records; failure stops the controller for human review. The API base and model are prompt context only in this minimal version; no key is stored and no teacher API is called by the controller.

## Command Database

Build the read-only command database once. It indexes level metadata and every command instance, so a teacher model can retrieve a command and its surrounding 5-10 commands without loading large scene JSON files.

```bash
python3 agent-debugger/build_command_db.py --project customer-demo
python3 agent-debugger/query_command_db.py stats
python3 agent-debugger/query_command_db.py find --type SCENE_REDIRECT --limit 3
```

## First SFT Dataset: Command Mappings

The first fine-tuning dataset is intentionally smaller than a full game trajectory. Each record maps a concrete Chinese authoring request and compact asset catalog to one command or a 2-4 command motif. It validates command ids, command types, parameter objects, primary command coverage, and real versus virtual resource declarations.

```bash
export VIBE_TEACHER_API_BASE=http://127.0.0.1:18765/v1
export VIBE_TEACHER_API_KEY=local
export VIBE_TEACHER_MODEL=DeepSeekV4

# Four-worker 100-sample trial
python3 agent-debugger/command_synthesize.py --samples 100 --workers 4 --max-actions 20

# Full first corpus: each indexed command type receives 50 variants
python3 agent-debugger/command_synthesize.py --per-command 50 --workers 4
```

The synthesizer keeps a constant system prompt and compact command examples, allowing local vLLM prefix caching to reuse the shared prefix. About 70% of samples are atomic command mappings; about 30% are 2-4 command motifs for engine-specific dependencies such as show-image plus animation, dragging plus drop checks, state updates plus conditions, and scene flow.

The teacher is not given fixed examples in advance. It chooses its own retrieval and validation loop. `DeepSeekV4` at the local endpoint above supports the default `openai` protocol. `DeepSeekV4-thinking` can be selected by changing `VIBE_TEACHER_MODEL`. Use `--tool-protocol json-envelope` only for endpoints that place a call in text rather than `message.tool_calls`.

```text
find_command_examples -> get_command_context / get_level_metadata
-> validate_sample -> revise or finish
```

`--max-actions` defaults to `20`. At the cap, the controller makes one final no-tools request with the complete tool transcript and accepts it only when the validator passes. Successful records retain the tool trace, so the next training stage can convert them to the model's native tool-call format.
