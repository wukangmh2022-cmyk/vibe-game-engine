#!/usr/bin/env bash
# GPU phase: refuse downloads and start the validated QLoRA preset immediately.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QLORA_PYTHON="${QLORA_PYTHON:-}"
MODEL_DIR="${MODEL_DIR:-$ROOT/training/models/Qwen3.5-9B}"

source "$SCRIPT_DIR/resolve_train_python.sh"

if FOUND_PYTHON="$(qlora_find_python "$ROOT" 1)"; then
  QLORA_PYTHON="$FOUND_PYTHON"
else
  echo "Training environment is not ready for GPU QLoRA. Run this in no-GPU mode first:" >&2
  echo "  bash $SCRIPT_DIR/prepare_qwen35_9b.sh" >&2
  qlora_report_missing "${PYTHON_BIN:-python}" 1
  exit 2
fi
if [[ ! -f "$MODEL_DIR/config.json" ]] || ! compgen -G "$MODEL_DIR/*.safetensors" >/dev/null; then
  echo "Base model incomplete at $MODEL_DIR. Return to no-GPU mode and run training/qlora/prepare_qwen35_9b.sh" >&2
  exit 2
fi

cd "$ROOT"
exec "$QLORA_PYTHON" "$SCRIPT_DIR/train_qwen35_9b.py" \
  --model-name-or-path "$MODEL_DIR" "$@"
