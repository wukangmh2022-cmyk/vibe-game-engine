#!/usr/bin/env bash
# Start the prepared Qwen3-4B base and DSL-V3 LoRA API without downloading.
set -euo pipefail

ROOT="${ROOT:-/root}"
PID_FILE="$ROOT/training/inference/vllm-qwen3-4b-dsl-v3.pid"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "vLLM is already running (PID $(cat "$PID_FILE"))."
  exit 0
fi

exec env \
  VLLM_PYTHON=/root/miniconda3/bin/python \
  MODEL_ID=Qwen/Qwen3-4B-Instruct-2507 \
  MODEL_DIR="$ROOT/training/models/Qwen3-4B-Instruct-2507" \
  ADAPTER_DIR="$ROOT/training/qlora/outputs/vibe-level-qwen35-4b-dsl-v3" \
  BASE_MODEL_NAME=qwen3-4b-instruct-2507 \
  ADAPTER_MODEL_NAME=vibe-level-qwen3-4b-dsl-v3 \
  HOST=127.0.0.1 \
  PORT=6006 \
  MAX_MODEL_LEN=2048 \
  GPU_MEMORY_UTILIZATION=0.90 \
  MAX_NUM_SEQS=12 \
  MAX_NUM_BATCHED_TOKENS=8192 \
  VLLM_DTYPE=float16 \
  VLLM_QUANTIZATION=none \
  VLLM_LOG_FILE="$ROOT/training/inference/vllm-qwen3-4b-dsl-v3.log" \
  VLLM_PID_FILE="$PID_FILE" \
  bash "$ROOT/training/inference/start_vllm_lora.sh" --background "$@"
