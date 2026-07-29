#!/usr/bin/env bash
# Start an OpenAI-compatible vLLM service with a QLoRA adapter.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VLLM_PYTHON="${VLLM_PYTHON:-$ROOT/.venv-vllm/bin/python}"

MODEL_ID="${MODEL_ID:-Qwen/Qwen3.6-27B}"
MODEL_DIR="${MODEL_DIR:-$ROOT/training/models/Qwen3.6-27B}"
ADAPTER_DIR="${ADAPTER_DIR:-$ROOT/training/qlora/outputs/vibe-level-qwen36-27b}"
BASE_MODEL_NAME="${BASE_MODEL_NAME:-qwen36-27b}"
ADAPTER_MODEL_NAME="${ADAPTER_MODEL_NAME:-vibe-level-qwen36-27b}"
ENABLE_LORA="${ENABLE_LORA:-1}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-6006}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-4096}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.90}"
MAX_NUM_SEQS="${MAX_NUM_SEQS:-16}"
MAX_NUM_BATCHED_TOKENS="${MAX_NUM_BATCHED_TOKENS:-32768}"
TENSOR_PARALLEL_SIZE="${TENSOR_PARALLEL_SIZE:-1}"
VLLM_DTYPE="${VLLM_DTYPE:-bfloat16}"
VLLM_QUANTIZATION="${VLLM_QUANTIZATION:-bitsandbytes}"
MODEL_SOURCE="${MODEL_SOURCE:-auto}"
BACKGROUND=0

if [[ "${1:-}" == "--background" ]]; then
  BACKGROUND=1
  shift
fi

if [[ ! -x "$VLLM_PYTHON" ]]; then
  cat >&2 <<EOF
vLLM environment is missing: $VLLM_PYTHON
Provision it on a non-GPU machine before starting this service:
  SKIP_CUDA_CHECK=1 VLLM_ENV_DIR=<environment-dir> bash $SCRIPT_DIR/bootstrap_vllm_env.sh aliyun
EOF
  exit 1
fi
# FlashInfer invokes `ninja` while compiling its first CUDA sampling kernel.
# The API process is launched via an absolute Python path, so add the venv's
# executable directory explicitly instead of relying on shell activation.
export PATH="$(dirname "$VLLM_PYTHON"):$PATH"
if [[ ! -f "$MODEL_DIR/config.json" ]]; then
  echo "Base model is missing: $MODEL_DIR/config.json. Download it before attaching a GPU." >&2
  exit 1
fi
cmd=(
  "$VLLM_PYTHON" -m vllm.entrypoints.openai.api_server
  --model "$MODEL_DIR"
  --served-model-name "$BASE_MODEL_NAME"
  --host "$HOST"
  --port "$PORT"
  --dtype "$VLLM_DTYPE"
  --gpu-memory-utilization "$GPU_MEMORY_UTILIZATION"
  --max-model-len "$MAX_MODEL_LEN"
  --max-num-seqs "$MAX_NUM_SEQS"
  --max-num-batched-tokens "$MAX_NUM_BATCHED_TOKENS"
  --tensor-parallel-size "$TENSOR_PARALLEL_SIZE"
  --enable-prefix-caching
  --trust-remote-code
)
if [[ "$VLLM_QUANTIZATION" != "none" && "$VLLM_QUANTIZATION" != "NONE" && -n "$VLLM_QUANTIZATION" ]]; then
  cmd+=(--quantization "$VLLM_QUANTIZATION")
fi
if [[ "$ENABLE_LORA" == "1" ]]; then
  if [[ ! -f "$ADAPTER_DIR/adapter_config.json" || ! -f "$ADAPTER_DIR/adapter_model.safetensors" ]]; then
    echo "LoRA adapter files are missing: $ADAPTER_DIR" >&2
    exit 1
  fi
  cmd+=(
    --enable-lora
    --max-lora-rank 32
    --lora-modules "$ADAPTER_MODEL_NAME=$ADAPTER_DIR"
  )
fi
cmd+=("$@")

printf 'Starting vLLM: base=%s adapter=%s adapter_enabled=%s max_model_len=%s max_num_seqs=%s\n' \
  "$BASE_MODEL_NAME" "$ADAPTER_MODEL_NAME" "$ENABLE_LORA" "$MAX_MODEL_LEN" "$MAX_NUM_SEQS"
if [[ "$BACKGROUND" == 1 ]]; then
  LOG_FILE="${VLLM_LOG_FILE:-$ROOT/training/inference/vllm-server.log}"
  PID_FILE="${VLLM_PID_FILE:-$ROOT/training/inference/vllm-server.pid}"
  nohup "${cmd[@]}" > "$LOG_FILE" 2>&1 < /dev/null &
  echo "$!" > "$PID_FILE"
  echo "Started PID $(cat "$PID_FILE"); log: $LOG_FILE"
else
  exec "${cmd[@]}"
fi
