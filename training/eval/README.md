# VGE DSL 评估流程

当前正式评估不再使用旧的 `command_benchmark_v1` 或均匀模板题作为主结论。第一阶段采用 `human_fragment_benchmark_v1`：从真实人类关卡的第一关 DSL 片段出发，生成 100 条工程化但自然的片段需求，再为每题拼接同一份 `VGE-DSL/1` system guidance、`TASK + CANVAS + ASSETS(id | type | path)` user prompt。

Base 和 Adapter 的输入必须逐字一致：同 system prompt、同 user prompt、同 thinking 关闭、同采样参数、同输出预算。这样差值才能归因于 LoRA adapter，而不是提示词或评估设置。

## 当前第一阶段结果

| 指标 | 4B Adapter + Guidance | 4B Base + Guidance | 说明 |
| --- | ---: | ---: | --- |
| 有效生成 | 100 / 100 | 100 / 100 | 两组请求均完整返回 |
| DSL 可解析 | 96 / 100 | 37 / 100 | Adapter 显著学到 DSL 语法与资源契约 |
| Runtime dry-run 通过 | 83 / 100 | 37 / 100 | Adapter 主流程执行仍明显领先 |
| Slot 3 平均 overall 分 | 6.931 | 3.384 | 独立 judge 盲化评审 |
| 盲评胜出 | 82 | 10 | 另有 tie 7、neither 1 |
| 公共可解析子集 | 37 条 | 37 条 | 双方都合法时再比较语义 |
| 公共子集盲评胜出 | 21 | 9 | 另有 tie 7 |
| 公共子集平均 overall | 7.600 | 6.359 | 排除格式失败后 Adapter 仍领先 |

Base 的大量失败不是网络或截断导致：两组都有完整 `raw_output`，Base 失败样本的 completion token 通常远低于输出上限。抽查显示主要是 DSL 语法和资源契约问题，例如资源 ID 引号、动画参数格式、JSON/animation 子字段、条件表达式等。

因此报告保留两种口径：

- 全量口径：衡量生产可用率，格式/运行失败必须计入。
- 公共可解析子集：只在双方都生成合法 DSL 时比较语义、交互和资源落地质量。

## 关键文件

- 测试集：`training/eval/cases/human_fragment_benchmark_v1.json`
- Adapter 输出：`training/eval/results/adapter-human-fragment-v1/generations.complete.jsonl`
- Base 输出：`training/eval/results/base-human-fragment-v1/generations.complete.jsonl`
- Adapter runtime：`training/eval/results/adapter-human-fragment-v1/generations.runtime-dry-run.jsonl`
- Base runtime：`training/eval/results/base-human-fragment-v1/generations.runtime-dry-run.jsonl`
- Slot 3 judge：`training/eval/results/human-fragment-v1-slot3-judge/summary.json`

## 运行方式

先启动本地或远端 OpenAI-compatible 服务，让 Base 和 Adapter 暴露为不同 model name。然后分别收集生成：

```bash
bash training/eval/collect_human_fragment_base.sh
bash training/eval/collect_human_fragment_adapter.sh
```

完成后运行 runtime dry-run 与语义 judge。judge 使用本地 `.env` 中的 Slot 3 配置，结果写入 `training/eval/results/human-fragment-v1-slot3-judge/`。

```bash
python training/eval/judge_human_fragment_pairwise.py \
  --cases training/eval/cases/human_fragment_benchmark_v1.json \
  --base training/eval/results/base-human-fragment-v1/generations.runtime-dry-run.jsonl \
  --adapter training/eval/results/adapter-human-fragment-v1/generations.runtime-dry-run.jsonl \
  --output-dir training/eval/results/human-fragment-v1-slot3-judge \
  --workers 8
```

## 后续评估方向

下一轮应构造带隐藏 `oracle.actions/assertions` 的 interaction benchmark。它不替代当前 100 条 human fragment benchmark，而是进一步验证 Adapter 的优势是否能完整转化为点击、拖拽、选择、跨事件信号、元素生命周期和多步状态断言下的真实可玩交互完成率。

旧的 `heldout_interaction_benchmark_v3.py`、`run_eval.py` 和 `run_interaction_eval.py` 仍保留为历史诊断/回归工具，但不作为当前第一阶段 README 的主结论来源。
