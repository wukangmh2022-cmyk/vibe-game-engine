#!/usr/bin/env bash
# Run in no-GPU mode: install dependencies, download the full base model, and verify token lengths.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QLORA_PYTHON="${QLORA_PYTHON:-}"
MODEL_ID="${MODEL_ID:-Qwen/Qwen3.5-9B}"
MODEL_DIR="${MODEL_DIR:-$ROOT/training/models/Qwen3.5-9B}"
MODEL_SOURCE="${MODEL_SOURCE:-auto}"
AUTO_INSTALL="${AUTO_INSTALL:-0}"
AUTO_DOWNLOAD_MODEL="${AUTO_DOWNLOAD_MODEL:-1}"

source "$SCRIPT_DIR/resolve_train_python.sh"

if FOUND_PYTHON="$(qlora_find_python "$ROOT" 0)"; then
  QLORA_PYTHON="$FOUND_PYTHON"
else
  echo "Training dependencies were not found in the current machine." >&2
  qlora_report_missing "${PYTHON_BIN:-python}" 0
  if [[ "$AUTO_INSTALL" != "1" ]]; then
    echo "Fast prepare stops here to avoid wasting time downloading packages." >&2
    echo "If you really want auto install, rerun: AUTO_INSTALL=1 bash $SCRIPT_DIR/prepare_qwen35_9b.sh" >&2
    exit 2
  fi
  echo "AUTO_INSTALL=1: installing missing dependencies now." >&2
  SKIP_CUDA_CHECK=1 USE_SYSTEM_TORCH="${USE_SYSTEM_TORCH:-1}" INSTALL_IN_CURRENT_ENV="${INSTALL_IN_CURRENT_ENV:-1}" "$SCRIPT_DIR/bootstrap_train_env.sh" "${PIP_MIRROR:-aliyun}"
  QLORA_PYTHON="${PYTHON_BIN:-python3}"
fi
if [[ ! -f "$MODEL_DIR/config.json" ]] || ! compgen -G "$MODEL_DIR/*.safetensors" >/dev/null; then
  if [[ "$AUTO_DOWNLOAD_MODEL" != "1" ]]; then
    echo "Base model incomplete at $MODEL_DIR." >&2
    echo "Fast prepare will not download because AUTO_DOWNLOAD_MODEL=0." >&2
    exit 2
  fi
  echo "Base model incomplete at $MODEL_DIR; downloading $MODEL_ID via $MODEL_SOURCE ..." >&2
  "$QLORA_PYTHON" "$ROOT/training/inference/download_model.py" \
    --model-id "$MODEL_ID" --output-dir "$MODEL_DIR" --source "$MODEL_SOURCE"
fi

cd "$ROOT"
"$QLORA_PYTHON" "$SCRIPT_DIR/tokenizer_preflight.py" \
  --model-name-or-path "$MODEL_DIR" \
  --data-dir training/qlora/data/level-authoring-dsl-v3 \
  --max-length 2048
echo "READY_FOR_GPU model=$MODEL_DIR"
