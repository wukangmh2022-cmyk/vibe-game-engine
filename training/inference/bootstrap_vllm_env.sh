#!/usr/bin/env bash
# Create an isolated vLLM environment. It never changes the QLoRA environment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="${VLLM_ENV_DIR:-$ROOT/.venv-vllm}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
MIRROR="${1:-aliyun}"
USE_SYSTEM_TORCH="${USE_SYSTEM_TORCH:-0}"

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

"$PYTHON_BIN" - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit("vLLM requires Python 3.10 or newer")
PY

if [[ ! -x "$ENV_DIR/bin/python" ]]; then
  venv_args=()
  if [[ "$USE_SYSTEM_TORCH" == "1" ]]; then
    # Reuse the CUDA-enabled Torch provided by the selected PyTorch image.
    venv_args+=(--system-site-packages)
  fi
  "$PYTHON_BIN" -m venv "${venv_args[@]}" "$ENV_DIR"
fi

VENV_PYTHON="$ENV_DIR/bin/python"
PIP_CACHE_DIR="${PIP_CACHE_DIR:-$ROOT/.pip-cache}" \
PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV_PYTHON" -m pip install \
  --index-url "$INDEX_URL" \
  -r "$SCRIPT_DIR/requirements-vllm.txt"

"$VENV_PYTHON" - <<'PY'
import os
import torch
import vllm
print(f"vLLM={vllm.__version__}")
print(f"torch={torch.__version__}, cuda={torch.version.cuda}, gpu_available={torch.cuda.is_available()}")
if not torch.cuda.is_available() and os.environ.get("SKIP_CUDA_CHECK") != "1":
    raise SystemExit("CUDA was not detected in the vLLM environment")
PY
