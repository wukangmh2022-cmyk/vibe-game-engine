#!/usr/bin/env bash
# Shared helper for QLoRA scripts. It prefers an already-working Python
# environment before creating/downloading a dedicated venv.

qlora_required_modules=(torch transformers accelerate peft bitsandbytes datasets sentencepiece safetensors huggingface_hub)

qlora_check_python() {
  local python_bin="$1"
  local require_cuda="${2:-0}"
  "$python_bin" - "$require_cuda" "${qlora_required_modules[@]}" <<'PY' >/tmp/qlora-python-check.out 2>/tmp/qlora-python-check.err
import importlib
import sys

require_cuda = sys.argv[1] == "1"
modules = sys.argv[2:]
missing = []
for name in modules:
    try:
        importlib.import_module(name)
    except Exception as error:
        missing.append(f"{name} ({error.__class__.__name__}: {error})")

if missing:
    print("缺少依赖：" + "; ".join(missing))
    raise SystemExit(1)

import torch
if require_cuda and not torch.cuda.is_available():
    print(f"缺少可用 CUDA：torch={torch.__version__}, cuda={torch.version.cuda}, cuda_available={torch.cuda.is_available()}")
    raise SystemExit(1)

import transformers, peft, bitsandbytes, datasets
print(
    f"依赖检查通过：python={sys.executable} torch={torch.__version__} cuda={torch.version.cuda} "
    f"cuda_available={torch.cuda.is_available()} transformers={transformers.__version__} "
    f"peft={peft.__version__} bitsandbytes={bitsandbytes.__version__} datasets={datasets.__version__}"
)
PY
}

qlora_find_python() {
  local root="$1"
  local require_cuda="${2:-0}"
  local candidates=()
  if [[ -n "${QLORA_PYTHON:-}" ]]; then candidates+=("$QLORA_PYTHON"); fi
  if command -v python >/dev/null 2>&1; then candidates+=("$(command -v python)"); fi
  if command -v python3 >/dev/null 2>&1; then candidates+=("$(command -v python3)"); fi
  if [[ -x /root/miniconda3/bin/python ]]; then candidates+=("/root/miniconda3/bin/python"); fi
  if [[ -x /opt/conda/bin/python ]]; then candidates+=("/opt/conda/bin/python"); fi
  if [[ -x "$root/.venv-qlora-cu121/bin/python" ]]; then candidates+=("$root/.venv-qlora-cu121/bin/python"); fi

  local seen=":"
  local candidate
  for candidate in "${candidates[@]}"; do
    [[ -x "$candidate" ]] || continue
    case "$seen" in *":$candidate:"*) continue ;; esac
    seen="${seen}${candidate}:"
    if qlora_check_python "$candidate" "$require_cuda"; then
      cat /tmp/qlora-python-check.out >&2
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

qlora_report_missing() {
  local python_bin="${1:-python}"
  local require_cuda="${2:-0}"
  if command -v "$python_bin" >/dev/null 2>&1 || [[ -x "$python_bin" ]]; then
    qlora_check_python "$python_bin" "$require_cuda" || true
    cat /tmp/qlora-python-check.out /tmp/qlora-python-check.err 2>/dev/null | sed '/^$/d' >&2 || true
  else
    echo "找不到 Python 可执行文件：$python_bin" >&2
  fi
}
