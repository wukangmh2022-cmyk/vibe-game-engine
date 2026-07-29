#!/usr/bin/env bash
# Create a dedicated CUDA 12.1 QLoRA environment without touching vLLM.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="${QLORA_ENV_DIR:-$ROOT/.venv-qlora-cu121}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
MIRROR="${1:-aliyun}"
USE_SYSTEM_TORCH="${USE_SYSTEM_TORCH:-0}"
INSTALL_IN_CURRENT_ENV="${INSTALL_IN_CURRENT_ENV:-1}"

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

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 && [[ -x /root/miniconda3/bin/python ]]; then
  PYTHON_BIN=/root/miniconda3/bin/python
fi

case "$MIRROR" in
  aliyun) INDEX_URL="https://mirrors.aliyun.com/pypi/simple" ;;
  tsinghua) INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple" ;;
  pypi) INDEX_URL="https://pypi.org/simple" ;;
  *)
    echo "Usage: $0 [aliyun|tsinghua|pypi]" >&2
    exit 2
    ;;
esac

if [[ "$INSTALL_IN_CURRENT_ENV" == "1" ]]; then
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "找不到 Python 可执行文件：$PYTHON_BIN" >&2
    exit 2
  fi
  VENV_PYTHON="$(command -v "$PYTHON_BIN")"
  echo "直接使用当前 Python 环境：$VENV_PYTHON"
elif [[ ! -x "$ENV_DIR/bin/python" ]]; then
  venv_args=()
  if [[ "$USE_SYSTEM_TORCH" == "1" ]]; then
    # The AutoDL PyTorch image already supplies a CUDA-enabled Torch build.
    venv_args+=(--system-site-packages)
  fi
  "$PYTHON_BIN" -m venv "${venv_args[@]}" "$ENV_DIR"
  VENV_PYTHON="$ENV_DIR/bin/python"
else
  VENV_PYTHON="$ENV_DIR/bin/python"
fi
REQUIREMENTS_FILE="$SCRIPT_DIR/requirements-train-cu121.txt"
TEMP_REQUIREMENTS_FILE=""

if [[ "$USE_SYSTEM_TORCH" == "1" ]]; then
  TEMP_REQUIREMENTS_FILE="$(mktemp)"
  REQUIREMENTS_FILE="$TEMP_REQUIREMENTS_FILE"
  awk '!/^torch==/ && !/^--extra-index-url/' "$SCRIPT_DIR/requirements-train-cu121.txt" > "$REQUIREMENTS_FILE"
fi

missing_packages="$("$VENV_PYTHON" - "$USE_SYSTEM_TORCH" <<'PY'
import importlib.util
import sys

use_system_torch = sys.argv[1] == "1"
required = [
    ("torch", "torch"),
    ("transformers", "transformers"),
    ("accelerate", "accelerate"),
    ("peft", "peft"),
    ("bitsandbytes", "bitsandbytes"),
    ("datasets", "datasets"),
    ("sentencepiece", "sentencepiece"),
    ("safetensors", "safetensors"),
    ("huggingface_hub", "huggingface_hub"),
]
missing = []
for package, module in required:
    if use_system_torch and package == "torch":
        continue
    if importlib.util.find_spec(module) is None:
        missing.append(package)
print(" ".join(missing))
PY
)"
if [[ -z "$missing_packages" ]]; then
  echo "训练依赖已齐全：$VENV_PYTHON"
  "$VENV_PYTHON" - <<'PY'
import torch, transformers, peft, bitsandbytes, datasets
print(f"torch={torch.__version__}, cuda={torch.version.cuda}, gpu_available={torch.cuda.is_available()}")
print(f"transformers={transformers.__version__}, peft={peft.__version__}, bitsandbytes={bitsandbytes.__version__}, datasets={datasets.__version__}")
PY
  exit 0
fi
echo "当前 Python 缺少这些训练依赖：$missing_packages"
if [[ " $missing_packages " == *" torch "* && "$USE_SYSTEM_TORCH" != "1" ]]; then
  confirm_large_download "缺少 torch，安装 CUDA 版 torch 通常超过 100MB（可能约 780MB）。" || {
    echo "已取消安装。建议使用 PyTorch 镜像，或设置 USE_SYSTEM_TORCH=1 复用系统 torch。" >&2
    exit 2
  }
fi
INSTALL_REQUIREMENTS_FILE="$(mktemp)"
trap 'rm -f "$INSTALL_REQUIREMENTS_FILE" ${TEMP_REQUIREMENTS_FILE:-}' EXIT
while IFS= read -r package_name; do
  [[ -n "$package_name" ]] || continue
  if [[ "$package_name" == "torch" && "$USE_SYSTEM_TORCH" == "1" ]]; then
    continue
  fi
  grep -E "^${package_name}([<=>!~]=|==|>=|<=|~=|>|<)" "$REQUIREMENTS_FILE" >> "$INSTALL_REQUIREMENTS_FILE" || true
done < <(tr ' ' '\n' <<< "$missing_packages")
if [[ " $missing_packages " == *" torch "* && "$USE_SYSTEM_TORCH" != "1" ]]; then
  grep -E '^--extra-index-url ' "$SCRIPT_DIR/requirements-train-cu121.txt" >> "$INSTALL_REQUIREMENTS_FILE" || true
fi
if [[ ! -s "$INSTALL_REQUIREMENTS_FILE" ]]; then
  echo "没有在 requirements 中找到需要安装的缺失包，请人工检查：$missing_packages" >&2
  exit 2
fi
echo "本次只安装这些缺失包："
sed 's/^/  /' "$INSTALL_REQUIREMENTS_FILE"
echo "开始从 $INDEX_URL 补齐缺失训练依赖；已安装的包不会重复下载。"
PIP_CACHE_DIR="${PIP_CACHE_DIR:-$ROOT/.pip-cache}" \
PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV_PYTHON" -m pip install \
  --index-url "$INDEX_URL" \
  --upgrade-strategy only-if-needed \
  -r "$INSTALL_REQUIREMENTS_FILE"

"$VENV_PYTHON" - <<'PY'
import os
import torch
import transformers
import peft
import bitsandbytes
import datasets
print(f"torch={torch.__version__}, cuda={torch.version.cuda}, gpu_available={torch.cuda.is_available()}")
print(f"transformers={transformers.__version__}, peft={peft.__version__}, bitsandbytes={bitsandbytes.__version__}, datasets={datasets.__version__}")
if not torch.cuda.is_available() and os.environ.get("SKIP_CUDA_CHECK") != "1":
    raise SystemExit("CUDA was not detected in the QLoRA environment")
PY
