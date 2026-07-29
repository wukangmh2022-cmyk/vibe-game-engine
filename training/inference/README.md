# vLLM QLoRA Inference

`requirements-vllm.txt` is deliberately independent from
`training/qlora/requirements-train-cu121.txt`. Create one virtual environment
for training and a second one for vLLM. Do not install both requirement files
into one Python environment.

The package mirror is selected when bootstrapping:

```bash
bash training/inference/bootstrap_vllm_env.sh aliyun
# or: bash training/inference/bootstrap_vllm_env.sh tsinghua
```

Start a 27B 4-bit bitsandbytes model plus its rank-32 LoRA adapter. The script
downloads the base model if it is not already present. `auto` tries the Hugging
Face mirror and then Alibaba ModelScope through resumable direct downloads.

```bash
MODEL_DIR=/root/autodl-tmp/models/Qwen3.6-27B \
ADAPTER_DIR=/root/vibe-game-engine/training/qlora/outputs/vibe-level-qwen36-27b \
BASE_MODEL_NAME=qwen36-27b \
ADAPTER_MODEL_NAME=vibe-level-qwen36-27b \
bash training/inference/start_vllm_lora.sh --background
```

The server exposes both names through `/v1/models`. Send `model=qwen36-27b`
to use the untouched base model, or `model=vibe-level-qwen36-27b` to attach
the LoRA adapter for that request. To serve only the base model, set
`ENABLE_LORA=0`.

Defaults are designed for a 48GB GPU: 4-bit weights, a 4096-token inference
window, and 16 active sequences. Training remains at its validated
1536-token limit. Increase `MAX_NUM_SEQS` only after running the benchmark.

```bash
python training/inference/benchmark_vllm_concurrency.py \
  --model vibe-level-qwen36-27b \
  --concurrency 1 2 4 8 16 24
```

For a 48GB card, the 27B NF4 weights normally occupy roughly 14-17GB after
loading, plus a few GB of runtime workspace and LoRA. The rest is used mostly
by the KV cache. The exact sequence capacity depends on the actual model
architecture and output length, so the benchmark result is the source of
truth.

The original scripts collected from the current server are retained unchanged
in `remote_snapshots/` for reference. The new launcher replaces their runtime
behavior; it uses vLLM continuous batching instead of serial Transformers
`generate()` calls.

For one-command 27B training on CUDA 12.1:

```bash
bash training/qlora/run_qwen36_27b.sh
```

This creates `.venv-qlora-cu121` and keeps it separate from `.venv-vllm`.
