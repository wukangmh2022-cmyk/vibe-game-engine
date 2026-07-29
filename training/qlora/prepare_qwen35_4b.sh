#!/usr/bin/env bash
# Run in no-GPU mode: install dependencies, download the 4B text base model,
# and verify token lengths before switching to GPU billing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QLORA_PYTHON="${QLORA_PYTHON:-}"
MODEL_ID="${MODEL_ID:-Qwen/Qwen3-4B-Instruct-2507}"
MODEL_DIR="${MODEL_DIR:-$ROOT/training/models/Qwen3-4B-Instruct-2507}"
MODEL_SOURCE="${MODEL_SOURCE:-auto}"
AUTO_INSTALL="${AUTO_INSTALL:-1}"
AUTO_DOWNLOAD_MODEL="${AUTO_DOWNLOAD_MODEL:-1}"

confirm_large_download() {
  local message="$1"
  if [[ "${ASSUME_YES:-0}" == "1" ]]; then
    echo "已设置 ASSUME_YES=1，自动确认：$message" >&2
    return 0
  fi
  echo "$message" >&2
  read -r -p "是否继续？输入 y 继续，其他任意键取消: " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

source "$SCRIPT_DIR/resolve_train_python.sh"

if FOUND_PYTHON="$(qlora_find_python "$ROOT" 0)"; then
  QLORA_PYTHON="$FOUND_PYTHON"
else
  echo "当前 Python 环境缺少训练依赖。" >&2
  qlora_report_missing "${PYTHON_BIN:-python}" 0
  if [[ "$AUTO_INSTALL" != "1" ]]; then
    echo "已设置 AUTO_INSTALL=0，因此不自动安装依赖。" >&2
    echo "如需自动补齐缺失依赖，运行：AUTO_INSTALL=1 bash $SCRIPT_DIR/prepare_qwen35_4b.sh" >&2
    exit 2
  fi
  echo "准备自动补齐缺失依赖；已有依赖不会重复安装。" >&2
  SKIP_CUDA_CHECK=1 USE_SYSTEM_TORCH="${USE_SYSTEM_TORCH:-1}" INSTALL_IN_CURRENT_ENV="${INSTALL_IN_CURRENT_ENV:-1}" "$SCRIPT_DIR/bootstrap_train_env.sh" "${PIP_MIRROR:-aliyun}"
  QLORA_PYTHON="${PYTHON_BIN:-python3}"
fi
if [[ ! -f "$MODEL_DIR/config.json" ]] || ! compgen -G "$MODEL_DIR/*.safetensors" >/dev/null; then
  if [[ "$AUTO_DOWNLOAD_MODEL" != "1" ]]; then
    echo "基础模型不存在或不完整：$MODEL_DIR" >&2
    echo "已设置 AUTO_DOWNLOAD_MODEL=0，因此不自动下载模型。" >&2
    exit 2
  fi
  confirm_large_download "基础模型不存在或不完整：$MODEL_DIR。即将下载 $MODEL_ID，体积通常超过 100MB（约数 GB）。" || {
    echo "已取消模型下载。" >&2
    exit 2
  }
  echo "开始下载基础模型：$MODEL_ID，来源：$MODEL_SOURCE ..." >&2
  "$QLORA_PYTHON" "$ROOT/training/inference/download_model.py" \
    --model-id "$MODEL_ID" --output-dir "$MODEL_DIR" --source "$MODEL_SOURCE"
else
  echo "基础模型已存在：$MODEL_DIR" >&2
fi

cd "$ROOT"
"$QLORA_PYTHON" "$SCRIPT_DIR/tokenizer_preflight.py" \
  --model-name-or-path "$MODEL_DIR" \
  --data-dir training/qlora/data/level-authoring-dsl-v3 \
  --max-length 2048
echo "准备完成，可以切 GPU 训练：model=$MODEL_DIR"
