#!/usr/bin/env bash
# Wait for the V4 QLoRA run to succeed, then provision and launch vLLM.
set -euo pipefail

ROOT="${ROOT:-/root/vibe-game-engine}"
TRAIN_PID_FILE="${TRAIN_PID_FILE:-$ROOT/logs/qwen35-9b-v4-train.pid}"
ADAPTER_DIR="${ADAPTER_DIR:-$ROOT/training/qlora/outputs/vibe-level-qwen35-9b-v4}"
VLLM_ENV_DIR="${VLLM_ENV_DIR:-/root/autodl-tmp/venvs/vllm-cu128}"
VLLM_PYTHON="${VLLM_PYTHON:-$VLLM_ENV_DIR/bin/python}"
DEPLOY_LOG="${DEPLOY_LOG:-/root/vibe-vllm-deployment.log}"
SERVER_LOG="${SERVER_LOG:-$ROOT/training/inference/vllm-qwen35-9b.log}"
SERVER_PID_FILE="${SERVER_PID_FILE:-$ROOT/training/inference/vllm-qwen35-9b.pid}"

mkdir -p "$(dirname "$DEPLOY_LOG")" "$(dirname "$SERVER_LOG")"
exec >>"$DEPLOY_LOG" 2>&1

printf '\n[%s] Waiting for Qwen3.5-9B V4 training to finish.\n' "$(date -Is)"
if [[ ! -f "$TRAIN_PID_FILE" ]]; then
  echo "Training PID file is missing: $TRAIN_PID_FILE"
  exit 1
fi

train_pid="$(cat "$TRAIN_PID_FILE")"
while kill -0 "$train_pid" 2>/dev/null; do
  sleep 30
done

if [[ ! -f "$ADAPTER_DIR/adapter_config.json" || ! -f "$ADAPTER_DIR/adapter_model.safetensors" ]]; then
  echo "Training exited without a final adapter; vLLM will not be started."
  exit 1
fi

printf '[%s] Training succeeded. Provisioning isolated vLLM environment.\n' "$(date -Is)"
export VLLM_ENV_DIR PIP_CACHE_DIR=/root/autodl-tmp/pip-cache
bash "$ROOT/training/inference/bootstrap_vllm_env.sh" aliyun

printf '[%s] Starting vLLM.\n' "$(date -Is)"
VLLM_PYTHON="$VLLM_PYTHON" \
MODEL_ID="Qwen/Qwen3.5-9B" \
MODEL_DIR="/root/autodl-tmp/models/Qwen3.5-9B" \
ADAPTER_DIR="$ADAPTER_DIR" \
BASE_MODEL_NAME="qwen35-9b" \
ADAPTER_MODEL_NAME="vibe-level-qwen35-9b-v4" \
HOST="127.0.0.1" \
PORT="6006" \
MAX_MODEL_LEN="4096" \
GPU_MEMORY_UTILIZATION="0.90" \
MAX_NUM_SEQS="8" \
MAX_NUM_BATCHED_TOKENS="8192" \
VLLM_LOG_FILE="$SERVER_LOG" \
VLLM_PID_FILE="$SERVER_PID_FILE" \
bash "$ROOT/training/inference/start_vllm_lora.sh" --background

printf '[%s] vLLM launch submitted. PID file: %s\n' "$(date -Is)" "$SERVER_PID_FILE"
