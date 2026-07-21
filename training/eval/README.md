# 固定评估集

`cases/command_benchmark_v1.json` 是人工编写、版本化的 36 个固定测试题，覆盖当前可预跑的 18 类引擎指令。每类两题：一题简要需求测基本契约，一题详细需求测资源、参数和依赖约束。`cases/level_module_benchmark_v1.json` 是另一个手工编写的 12 题完整关卡功能块集，每题要求 3-12 条命令完成一个可运行的欢迎、答题反馈、选择、过关或跳转流程。每题自带可引用的真实资源 `id/type/path`，模型不得自行检索、补充或虚构资源。

短指令集是第一阶段的主指标；功能块集是泛化观察项，不能与短指令分数混算。整关或 10 关游戏策划仍属于第二阶段：需要有经过浏览器运行时验证的长轨迹语料后，才应作为正式模型指标。

## 并发运行

将 Base 和 Adapter 暴露为同一个或兼容的 OpenAI `/v1/chat/completions` 服务中的两个 model id。评估器会对两个模型发送**完全相同**的 36 个 prompt，默认 8 并发，可选择 6-12；它不使用教师 API，也不会生成测试题。

```bash
export VIBE_EVAL_API_BASE=http://127.0.0.1:8000/v1
export VIBE_EVAL_API_KEY=local

python training/eval/run_eval.py \
  --run base=Qwen-Base-Model-Id \
  --run adapter=Vibe-Qlora-Adapter-Model-Id \
  --workers 8

# 再单独运行完整关卡功能块评估
python training/eval/run_eval.py \
  --cases training/eval/cases/level_module_benchmark_v1.json \
  --run base=Qwen-Base-Model-Id \
  --run adapter=Vibe-Qlora-Adapter-Model-Id \
  --workers 8
```

如果 Base 和 Adapter 分别运行在两个 endpoint，分别执行两次命令，各传一个 `--run`，再将两个 `summary.json` 的行合并到根 README 的结果表。

输出被忽略在 `training/eval/results/command-benchmark-v1-*/`：

- `results.jsonl`：每个 case 的 prompt 对应模型输出、延迟、token 用量、验证结果和报错。
- `summary.json`：每个模型的总通过率、运行时预跑通过率、平均延迟和失败清单。

生成 README 表：

```bash
python training/eval/report.py training/eval/results/command-benchmark-v1-YYYYMMDD-HHMMSS/summary.json
```

## 自动与人工评判

自动门槛由现有工程真实代码执行：JSON 解析、指定主指令、1 或 2-4 条顶层命令、真实资源契约、元素依赖顺序、循环语义，以及 `CommandExecutor` 内存预跑。任何一项失败都不计通过。

自动通过不等于好玩。正式对比后，从下列集合抽样人工试玩：Base 与 Adapter 都通过、仅 Adapter 通过、两者都失败。每组抽 6 个，导入编辑器运行，按 0/1 记录：需求是否被满足、交互是否可完成、文案是否自然、布局是否合理。人工表用于解释质量差异，不覆盖自动指标。

| 试玩组 | 样本数 | 需求满足 | 可完成交互 | 文案/布局 | 备注 |
| --- | ---: | ---: | ---: | ---: | --- |
| 仅 Adapter 通过 | 6 |  |  |  |  |
| 两者都通过 | 6 |  |  |  |  |
| 两者都失败 | 6 |  |  |  |  |
