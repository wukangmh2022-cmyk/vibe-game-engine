#!/usr/bin/env bash
# Persist the three README comparison groups before validation or scoring.
# Each invocation is resumable: successful case responses are fsynced to disk,
# while transient API errors are retained in the audit log and retried next run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_ROOT="${1:-$ROOT/training/eval/results/heldout-v3-generations}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

run_group() {
  local label="$1"
  shift
  "$PYTHON_BIN" "$ROOT/training/eval/collect_interaction_outputs.py" \
    --output-dir "$OUTPUT_ROOT/$label" \
    --workers 4 \
    --max-tokens 2100 \
    --require-complete \
    --run-label "$label" \
    "$@"
}

run_group base-guidance --profile qwen35_9b
run_group adapter-guidance --profile adapter
run_group adapter-without-guidance --profile adapter --without-guidance
