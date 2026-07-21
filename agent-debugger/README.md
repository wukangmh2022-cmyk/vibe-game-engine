# Agent Debugger

This is a local, text-only controller for producing verified trajectory batches. It does not store API keys and does not automatically call a teacher API.

```bash
python3 agent-debugger/distill.py init --api-base http://127.0.0.1:8000/v1 --model teacher-model --runner manual
python3 agent-debugger/distill.py debug
python3 agent-debugger/distill.py run --rounds 100
```

Each episode writes a prompt under `agent-debugger/runs/`. After a coding agent completes a batch, it must update `agent-debugger/progress.json` with the matching `episode_id` and `success` or `failed` status. Success unlocks the next prompt only after the script validates 10 accepted JSONL records; failure stops the controller for human review. The API base and model are prompt context only in this minimal version; no key is stored and no teacher API is called by the controller.
