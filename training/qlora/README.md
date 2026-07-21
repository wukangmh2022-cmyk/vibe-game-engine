# 单卡 QLoRA 训练

目标是训练“中文需求 + 已给资源清单 -> 可执行 commands JSON”，不训练教师工具轨迹或长推理文本。默认参数按 27B 级 Qwen 密集模型和一张 4090 设计：NF4 4-bit、LoRA r=32、单卡 batch=1、梯度累积 16、最大长度 3072。

在 AutoDL 环境安装：

```bash
pip install -r training/qlora/requirements.txt
```

准备数据。脚本会拒绝未包含 `validation.runtime.valid=true` 的记录：

```bash
python training/qlora/prepare_data.py \
  --input training-data/command-agent-sft \
  --output-dir training/qlora/data/command-sft-v1
```

开始训练，`MODEL` 替换为已下载或 Hugging Face 可访问的 Qwen 27B 模型路径：

```bash
export MODEL=/root/autodl-tmp/Qwen-model
python training/qlora/train_qlora.py \
  --model-name-or-path "$MODEL" \
  --data-dir training/qlora/data/command-sft-v1 \
  --output-dir training/qlora/outputs/vibe-command-qlora
```

OOM 时按顺序把 `--max-length` 降至 2048、`--lora-r` 降至 16；不要先降低 4-bit 量化。训练完成的输出目录是 PEFT adapter，不是合并后的基础模型。评估时把 adapter 挂载到同一基础模型，并用 `training/eval/` 与 Base 比较。

通过固定评估后，按 [MODEL_CARD_TEMPLATE.md](MODEL_CARD_TEMPLATE.md) 登记基础模型 revision、数据 manifest、超参数和 Base/Adapter 分数。发布到 GitHub 时只上传 adapter 与报告；权重大于 100 MB 时使用 Git LFS 或 GitHub Release，基础模型只保留其原始模型 id。
