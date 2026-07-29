#!/usr/bin/env bash
# Collect base-model generations for the balanced human-fragment benchmark.
# Keep every generation condition identical to the adapter run except model name.
set -euo pipefail

ROOT="${ROOT:-/root}"
PORT="${PORT:-6006}"
WORKERS="${WORKERS:-4}"
MAX_TOKENS="${MAX_TOKENS:-768}"
TIMEOUT="${TIMEOUT:-180}"
RUN_LABEL="${RUN_LABEL:-base-human-fragment-v1}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT/training/eval/results/$RUN_LABEL}"

export VIBE_EVAL_ADAPTER_API_BASE="http://127.0.0.1:$PORT/v1"
export VIBE_EVAL_ADAPTER_API_KEY="${VIBE_EVAL_ADAPTER_API_KEY:-local}"
export VIBE_EVAL_ADAPTER_MODEL="${VIBE_EVAL_ADAPTER_MODEL:-qwen3-4b-instruct-2507}"

exec /root/miniconda3/bin/python "$ROOT/training/eval/collect_interaction_outputs.py" \
  --profile adapter \
  --cases "$ROOT/training/eval/cases/human_fragment_benchmark_v1.json" \
  --workers "$WORKERS" \
  --temperature 0 \
  --max-tokens "$MAX_TOKENS" \
  --timeout "$TIMEOUT" \
  --run-label "$RUN_LABEL" \
  --output-dir "$OUTPUT_DIR" \
  --require-complete
