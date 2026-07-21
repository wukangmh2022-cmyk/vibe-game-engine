# Vibe Command QLoRA Adapter

## Base Model

- Base model id / revision: `待填`
- Adapter type: NF4 QLoRA
- Training commit: `待填`

## Training Data

- Dataset manifest: `training/qlora/data/command-sft-v1/manifest.json`
- Accepted executable records: `待填`
- Validation split: `待填`
- Resource policy: real project resources only; no virtual placeholders
- Runtime gate: `CommandExecutor` in-memory dry run required

## Hyperparameters

- GPU: `待填`
- Sequence length: `3072`
- LoRA: `r=32`, `alpha=64`, `dropout=0.05`
- Quantization: 4-bit NF4 with double quantization
- Batch / accumulation: `1 / 16`
- Learning rate / epochs: `1e-4 / 3`

## Evaluation

| Benchmark | Base | Adapter | Notes |
| --- | ---: | ---: | --- |
| command_benchmark_v1 (36) | 待填 | 待填 | JSON + contract + runtime dry run |
| level_module_benchmark_v1 (12) | 待填 | 待填 | 3-12 command functional modules |
| Human editor playtest | 待填 | 待填 | 0/1 requirement, interaction, copy/layout |

## Publication Checklist

- [ ] `adapter_config.json`, adapter `*.safetensors`, tokenizer files and this model card are present.
- [ ] Training manifest and both evaluation `summary.json` files are attached.
- [ ] Adapter weights larger than 100 MB are published through Git LFS or a GitHub Release, never as ordinary Git blobs.
- [ ] Base model is referenced by id and revision; do not duplicate its full weights in this repository.
