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

The first fine-tuning dataset is intentionally smaller than a full game trajectory. Each record maps a concrete Chinese authoring request and compact asset catalog to one command or a 2-4 command motif. The executable corpus accepts only real resources exposed by level metadata, then runs the commands through the real `CommandExecutor` with in-memory adapters before writing JSONL.

```bash
export VIBE_TEACHER_API_BASE=http://127.0.0.1:18765/v1
export VIBE_TEACHER_API_KEY=local
export VIBE_TEACHER_MODEL=DeepSeekV4

# Four-worker 100-sample trial
python3 agent-debugger/command_synthesize.py --samples 100 --workers 4 --max-actions 20

# Full first corpus: each indexed command type receives 50 variants
python3 agent-debugger/command_synthesize.py --per-command 50 --workers 4
```

The synthesizer keeps a constant system prompt and compact command examples, allowing local vLLM prefix caching to reuse the shared prefix. It schedules 72% atomic mappings and 28% 2-4 command motifs; commands with a required element or loop dependency are always motifs. The first executable pass intentionally excludes browser/Pixi-only commands until their dedicated runtime harness is added. Virtual-resource templates belong in a separate future corpus and are never mixed into executable samples.

The teacher is not given fixed examples in advance. It chooses its own retrieval and validation loop. `DeepSeekV4` at the local endpoint above supports the default `openai` protocol. `DeepSeekV4-thinking` can be selected by changing `VIBE_TEACHER_MODEL`. Use `--tool-protocol json-envelope` only for endpoints that place a call in text rather than `message.tool_calls`.

```text
find_command_examples -> get_command_context / get_level_metadata
-> validate_sample -> revise or finish
```

`--max-actions` defaults to `20`. At the cap, the controller makes one final no-tools request with the complete tool transcript and accepts it only when the validator passes. Successful records retain the tool trace, so the next training stage can convert them to the model's native tool-call format.

## Persistent Task Queue

`task_queue.py` treats every uncovered curriculum slot as a durable SQLite task. The queue remembers task state, attempts, worker activity, and events. Accepted samples are appended to one persistent file only: `training-data/command-agent-sft/corpus.jsonl`. Workers never write that file: they return a completed record to the controller, which serially writes it and then commits the task as complete.

Prepare the full queue without calling the teacher API:

```bash
python3 agent-debugger/task_queue.py --prepare-only
```

Run all uncovered slots using eight workers. Failed tasks return to the queue until the retry limit is reached:

```bash
python3 agent-debugger/task_queue.py --workers 8 --max-attempts 3 --timeout 180 --max-actions 8
```

You can prepare selected batches or exact plan IDs:

```bash
python3 agent-debugger/task_queue.py --prepare-only --batch 8 --batch 9
python3 agent-debugger/task_queue.py --prepare-only --plan-ids g0801,g0802
```

In a separate terminal, serve and open the monitor at `http://localhost:8090/agent-debugger/dashboard/`. It reloads `task-queue-status.json` every second and shows each worker as a person with its current task and latest tool-call message.

```bash
node scripts/serve.js 8090
```

Newly generated intents describe the current blank level, while source scenes are used only to retrieve valid assets. To audit historical records without changing data:

```bash
python3 agent-debugger/sanitize_corpus_intents.py
```

After reviewing the count, normalize the same `corpus.jsonl` in place atomically:

```bash
python3 agent-debugger/sanitize_corpus_intents.py --apply
```
