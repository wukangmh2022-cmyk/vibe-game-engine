#!/usr/bin/env bash
# Fast no-download/no-install check for already-prepared training images.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODEL_DIR="${MODEL_DIR:-$ROOT/training/models/Qwen3-4B-Instruct-2507}"

source "$SCRIPT_DIR/resolve_train_python.sh"

if ! FOUND_PYTHON="$(qlora_find_python "$ROOT" 0)"; then
  echo "NOT_READY: training Python dependencies are missing; no install was attempted." >&2
  qlora_report_missing "${PYTHON_BIN:-python}" 0
  exit 2
fi

if [[ ! -f "$MODEL_DIR/config.json" ]] || ! compgen -G "$MODEL_DIR/*.safetensors" >/dev/null; then
  echo "NOT_READY: base model incomplete at $MODEL_DIR; no download was attempted." >&2
  exit 2
fi

cd "$ROOT"
"$FOUND_PYTHON" "$SCRIPT_DIR/tokenizer_preflight.py" \
  --model-name-or-path "$MODEL_DIR" \
  --data-dir training/qlora/data/level-authoring-dsl-v3 \
  --max-length 2048
echo "READY_FOR_GPU python=$FOUND_PYTHON model=$MODEL_DIR"
