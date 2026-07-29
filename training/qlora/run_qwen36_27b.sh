#!/usr/bin/env bash
# One-command QLoRA training for Qwen3.6-27B at the validated 2048-token limit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QLORA_PYTHON="${QLORA_PYTHON:-}"
MODEL_ID="${MODEL_ID:-Qwen/Qwen3.6-27B}"
MODEL_DIR="${MODEL_DIR:-$ROOT/training/models/Qwen3.6-27B}"
MODEL_SOURCE="${MODEL_SOURCE:-auto}"

source "$SCRIPT_DIR/resolve_train_python.sh"

if FOUND_PYTHON="$(qlora_find_python "$ROOT" 1)"; then
  QLORA_PYTHON="$FOUND_PYTHON"
else
  echo "Training environment is not ready for GPU QLoRA. Prepare dependencies in no-GPU mode first:" >&2
  echo "  SKIP_CUDA_CHECK=1 USE_SYSTEM_TORCH=1 bash $SCRIPT_DIR/bootstrap_train_env.sh ${PIP_MIRROR:-aliyun}" >&2
  qlora_report_missing "${PYTHON_BIN:-python}" 1
  exit 2
fi
if [[ ! -f "$MODEL_DIR/config.json" ]] || ! compgen -G "$MODEL_DIR/*.safetensors" >/dev/null; then
  echo "Base model incomplete at $MODEL_DIR. Prepare/download the 27B base model in no-GPU mode first, or pass MODEL_DIR=/path/to/model." >&2
  echo "Suggested no-GPU download:" >&2
  echo "  MODEL_ID=$MODEL_ID MODEL_DIR=$MODEL_DIR MODEL_SOURCE=$MODEL_SOURCE python training/inference/download_model.py --model-id '$MODEL_ID' --output-dir '$MODEL_DIR' --source '$MODEL_SOURCE'" >&2
  exit 2
fi

cd "$ROOT"
exec "$QLORA_PYTHON" "$SCRIPT_DIR/train_qwen36_27b.py" \
  --model-name-or-path "$MODEL_DIR" "$@"
