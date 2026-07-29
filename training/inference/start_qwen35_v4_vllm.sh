#!/usr/bin/env bash
# Start the prepared Qwen3.5-9B base and V4 LoRA API without downloading.
set -euo pipefail

ROOT="${ROOT:-/root/vibe-game-engine}"
PID_FILE="$ROOT/training/inference/vllm-qwen35-9b.pid"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "vLLM is already running (PID $(cat "$PID_FILE"))."
  exit 0
fi

exec env \
  VLLM_PYTHON=/root/autodl-tmp/venvs/vllm-cu128/bin/python \
  MODEL_ID=Qwen/Qwen3.5-9B \
  MODEL_DIR=/root/autodl-tmp/models/Qwen3.5-9B \
  ADAPTER_DIR="$ROOT/training/qlora/outputs/vibe-level-qwen35-9b-v4" \
  BASE_MODEL_NAME=qwen35-9b \
  ADAPTER_MODEL_NAME=vibe-level-qwen35-9b-v4 \
  HOST=127.0.0.1 \
  PORT=6006 \
  MAX_MODEL_LEN=4096 \
  GPU_MEMORY_UTILIZATION=0.90 \
  MAX_NUM_SEQS=8 \
  MAX_NUM_BATCHED_TOKENS=8192 \
  VLLM_LOG_FILE="$ROOT/training/inference/vllm-qwen35-9b.log" \
  VLLM_PID_FILE="$PID_FILE" \
  bash "$ROOT/training/inference/start_vllm_lora.sh" --background "$@"
