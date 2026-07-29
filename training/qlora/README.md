# 单卡 QLoRA 训练

目标是训练“中文需求 + 画布和资源清单 -> VGE-DSL/1”。DSL 在编辑器中编译回现有 `commands + extra_events` JSON，游戏保存与运行时协议不变。训练目标不包含教师轨迹、解释或 Thinking。

最终第一阶段数据位于 `training/qlora/data/level-authoring-dsl-v3/`：以旧版 DSL 数据为只读基线，经过人工审查网页、DeepSeek/Claude/OpenAI 多轮 judge、Slot 3 API repair、手工批注合并和 final runtime gate，生成正式训练 1139 条、验证 126 条，合计 1265 条。V3 已通过 DSL 编译、序列化/解析 round-trip、静态检查和真实 JS runtime dry-run；训练目标不包含 Thinking。

在 AutoDL 无显卡模式准备环境和完整基础模型：

```bash
bash training/qlora/prepare_qwen35_4b.sh
```

看到 `READY_FOR_GPU` 后再切换 GPU。GPU 模式只运行下面一条；它不会安装依赖或下载模型，缺文件会立即退出：

```bash
bash training/qlora/run_qwen35_4b.sh 2>&1 | tee training/qlora/qwen3-4b-dsl-v3-train.log
```

4B 训练模板显式使用 `enable_thinking=False`、NF4、LoRA rank 32、micro batch 1、梯度累积训练、长度 2048，并按 `eval_loss` 恢复最佳 checkpoint。27B preset 使用 rank 64。自定义模型目录时，两阶段命令都传同一个环境变量：

```bash
MODEL_DIR=/root/training/models/Qwen3-4B-Instruct-2507 bash training/qlora/prepare_qwen35_4b.sh
MODEL_DIR=/root/training/models/Qwen3-4B-Instruct-2507 bash training/qlora/run_qwen35_4b.sh
```

## 二阶段训练答案审计

`audit_training_quality.py` 使用 `agent-debugger/.env` 中 `--slot` 指定的端点（默认 Slot 2）。它先用每条正式数据原样的 system + user 生成独立候选，再随机化 gold 的 A/B 位置做盲评，并把双方 DSL 的本地解析与静态检查一并提供给裁判。运行可恢复；模型裁判只负责筛选，不会修改训练集或人工修复账本。

先跑小批探针，确认端点与裁判输出，再运行全量：

```bash
python3 training/qlora/audit_training_quality.py --workers 4 --limit 10 \
  --output-dir training-data/dsl-quality-audit-probe

python3 training/qlora/audit_training_quality.py --slot 4 --workers 16
```

进度在 `training-data/dsl-quality-audit/status.json`，全部结果在 `all-results.jsonl`，仅 gold 被判更差的记录在 `gold-worse.jsonl`，请求或解析失败在 `errors.jsonl`。中断后执行同一命令会按 source 与三段消息哈希续跑。每条告警必须人工核对；属实后明确写入 `training-data/dsl-manual-review.md` 和 `training-data/dsl-manual-repairs.jsonl`，重新生成数据，并再次运行静态、真实 JS runtime 和 tokenizer gates。

训练完成的输出目录是 PEFT adapter，不是合并后的基础模型。checkpoint 以 eval loss 恢复最佳，再用 human-fragment benchmark 的 parse/runtime dry-run/Slot 3 盲化语义结果判断是否发布，不能只看 train loss。完整实验、增强与 DPO/RL 决策记录在主 README 的指令模型实验章节。

通过固定评估后，按 [MODEL_CARD_TEMPLATE.md](MODEL_CARD_TEMPLATE.md) 登记基础模型 revision、数据 manifest、超参数和 Base/Adapter 分数。发布到 GitHub 时只上传 adapter 与报告；权重大于 100 MB 时使用 Git LFS 或 GitHub Release，基础模型只保留其原始模型 id。

## 本地 Adapter 推理服务

4B 第一阶段线上评估使用 vLLM OpenAI 兼容服务：同一 Qwen3-4B-Instruct-2507 基座同时暴露 Base 模型名与 LoRA Adapter 模型名，评估脚本对二者发送完全相同的 system/user prompt。旧的 `serve_qwen35_adapter.py` 仅保留为 Transformers 调试 fallback，不作为正式并发评估入口。

发布产物是 `training/qlora/outputs/vibe-level-qwen3-4b-dsl-v3/` 下的 `adapter_config.json` 与 `adapter_model.safetensors`。权重大于 100 MB，必须使用 Git LFS 或 GitHub Release；基础模型只保留原始模型 id。

```bash
bash training/inference/start_qwen3_4b_dsl_v3_vllm.sh --enforce-eager
```

服务默认监听远端 `127.0.0.1:6006`，提供 `/health`、`/v1/models` 与 `/v1/chat/completions`。从本地建立隧道：

```bash
ssh -CNg -L 8080:127.0.0.1:6006 root@region-3.autodl.com -p 48332
```

此后本地请求地址为 `http://127.0.0.1:8080/v1/chat/completions`，Base 模型名为 `qwen3-4b-instruct-2507`，Adapter 模型名为 `vibe-level-qwen3-4b-dsl-v3`。
## Runtime acceptance gate

Before formatting QLoRA data, run the final DSL/runtime gate. It compiles every DSL row, checks resource contracts and element/control-flow dependencies, then constructs a complete placeholder-backed game and executes it through `CommandExecutor` and the browser/Pixi handler registration set. The raw corpus and repair ledgers remain auditable; only rows that pass this gate enter `train.jsonl` / `validation.jsonl`.

```bash
python3 training/qlora/prepare_dsl_data.py \
  --output-dir training/qlora/data/level-authoring-dsl-v3

python3 training/qlora/validate_dsl_corpus.py \
  training/qlora/data/level-authoring-dsl-v3
```

`data_contract.py` and `tokenizer_preflight.py` are run by the training scripts before GPU work starts; silent truncation is forbidden.
