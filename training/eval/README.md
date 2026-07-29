# 固定评估集

`cases/command_benchmark_v1.json` 是人工编写、版本化的 36 个固定测试题，覆盖当前可预跑的 18 类引擎指令。每类两题：一题简要需求测基本契约，一题详细需求测资源、参数和依赖约束。`cases/level_module_benchmark_v1.json` 是另一个手工编写的 12 题完整关卡功能块集，每题要求 3-12 条命令完成一个可运行的欢迎、答题反馈、选择、过关或跳转流程。它们使用 `customer-demo` 资源目录，而该目录属于当前训练来源范围，因此只保留为运行时回归 smoke test，不作为最终泛化分数。

当前硬指标是下文的 held-out v4 runtime 分数。短指令集和功能块集只用于检测引擎回归，不能与 held-out 分数混算。自然语言需求的语义符合度由盲化的 frontier-model judge 分维度评估；生产通过要求 runtime 与语义评审同时通过，两份原始结论均保留。

训练时的随机 validation 也不作为测试集。15 个原始人类关卡数量有限，同一关卡的资源、题材和流程高度相关；从其中切一部分做测试会产生源数据泄漏，既浪费最稀缺的高质量样本，也无法衡量模型对新需求的泛化。原始关卡全部用于训练数据的高质量锚点，最终泛化结论只使用下面从零设计、完全不读取训练语料和训练资源的 held-out v4。

## 交互与事件评估 v4

`heldout_interaction_benchmark_v3.py` 是现有 CLI 的兼容入口，返回 schema 为 v4 的 100 条 held-out 测试。题目不读取训练语料，不复用训练资源或场景；10 类能力各有 10 条人工复核过的自然用户表达，覆盖点击、拖拽、投放、翻牌、选中反馈、选择菜单、文本/等待/音效/图片序列和三种事件协调。题面只说明产品行为，不泄露 DSL 命令、内部 ID 或隐藏 oracle；跨流程题会明确业务上的发起、通知、响应与状态依赖，使隐藏因果检查不再超出用户要求。资源只使用 `virtual://heldout-evaluation/v4/...`。

正式训练、编辑器和评估使用相同 user 消息结构：`TASK + CANVAS + ASSETS(id | type | path)`，并逐字共享完整 V3 Guidance。题目内容与训练集独立；一致的是产品入口的表达分布和资源呈现协议，而不是复制训练 query。

实现细节明确的 80 条题面保留在 `heldout_interaction_benchmark_v3_technical.py`，用于诊断对照，不能与自然语言 v4 的正式泛化分数混算。需要运行这套技术基线时，显式传入：

```bash
python training/eval/run_interaction_eval.py \
  --cases training/eval/heldout_interaction_benchmark_v3_technical.py \
  --profile qwen36_27b \
  --workers 4
```

评估器将模型的 `commands + extra_events` 组装为完整关卡，用真实 `CommandExecutor`、`EventManager` 和浏览器/Pixi handler 执行。操作通过 `pointertap`、`pointerdown`、`pointermove`、`pointerup` 或信号注入完成；断言只检查可训练的功能状态，包括变量、元素位置/状态、信号次数和事件执行次数，不评判视觉布局或审美。

```bash
python training/eval/run_interaction_eval.py \
  --profile qwen35_9b \
  --profile adapter \
  --workers 4

python training/eval/run_interaction_eval.py \
  --profile adapter \
  --without-guidance \
  --workers 4
```

输出位于 `training/eval/results/vibe-interaction-event-eval-v4-heldout-*/`：`results.jsonl` 保留逐题模型输出、运行时轨迹和断言；`summary.json` 分别统计结构通过、运行时通过、oracle/交互完成和最终通过。评估固定关闭 thinking，默认最多生成 768 个 DSL token。

端点配置写在本地、被 git 忽略的 `agent-debugger/.env`。可填写 `VIBE_EVAL_QWEN36_27B_*`、`VIBE_EVAL_QWEN35_9B_*` 与训练完成后的 `VIBE_EVAL_ADAPTER_*` 三组 `API_BASE/API_KEY/MODEL`。脚本直接读取该文件，不需要 `source`，也不会输出 key。

完整 `LEVEL_PATCH_PROMPT_V3` 同时进入正式 SFT system 消息与评估推理。正式报告固定保留三组：同一基座的 `Base + Guidance`、同一基座挂载 LoRA 的 `Adapter + Guidance`，以及 `Adapter - Guidance` 诊断组。前两组必须使用逐字一致的 system 与 user 消息、thinking设置、采样参数和输出预算，差值才能归因于微调；第三组只移除 system Guidance，user task保持逐字不变。

在调用任何模型前，可先验证固定题、模拟操作与 oracle 的自洽性：

```bash
python training/eval/verify_interaction_reference.py
# 预期：100 passed, 0 failed
```

### 语义盲化评审

自然语言题面不能只靠死代码完整判断业务语义。因此在 Base/Adapter 的 runtime 评测结束后，可使用独立 judge 对**已有** `results.jsonl` 做语义审计：judge 只看用户需求、候选 JSON 和真实运行证据，不会看到模型来源、模型 ID、隐藏 oracle 或参考答案。

在本地 `.env` 填写 `VIBE_EVAL_JUDGE_API_BASE/API_KEY/MODEL` 后运行：

```bash
python training/eval/run_semantic_judge.py \
  training/eval/results/vibe-interaction-event-eval-v4-heldout-YYYYMMDD-HHMMSS/results.jsonl \
  --passes 3 \
  --workers 4
```

每个候选会以 `temperature=0` 重复评 3 次。Judge 看不到 run/model/Adapter 身份、参考答案和隐藏 oracle。它逐项核对实质需求，并从需求覆盖、行为因果、资源落地、交互反馈、布局呈现、克制与无幻觉六维评分；总分由本地代码按固定权重计算。只有三次一致且分数标准差不超过 1 的 `pass/fail` 才聚合为结论，其余标为 `review`。最终 `combined_passed` 仅在 hard runtime 与盲化语义评审都通过时成立。

## 并发运行

将 Base 和 Adapter 暴露为兼容 OpenAI `/v1/chat/completions` 的服务。两者可以使用同一个或不同 endpoint；评估器会对每个 profile 发送完全相同的 prompt，默认并发为 4，可选择 1-32。串行 Transformers 服务应使用 `--workers 1`；vLLM 服务稳定后可再压测提高 worker 数。它不使用教师 API，也不会生成测试题。

```bash
python training/eval/run_eval.py \
  --profile qwen35_9b \
  --profile adapter \
  --workers 4

# 再单独运行完整关卡功能块评估
python training/eval/run_eval.py \
  --cases training/eval/cases/level_module_benchmark_v1.json \
  --profile qwen35_9b \
  --profile adapter \
  --workers 4

# 单独运行 Adapter - Guidance 消融组
python training/eval/run_eval.py \
  --profile adapter \
  --without-guidance \
  --workers 4
```

训练前也可以只运行 `--profile qwen36_27b` 或 `--profile qwen35_9b` 获取回归基线。训练完成后再加 `--profile adapter` 比较回归；正式泛化结论使用 held-out v4 协议。

输出被忽略在 `training/eval/results/command-benchmark-v1-*/`：

- `results.jsonl`：每个 case 的 prompt 对应模型输出、延迟、token 用量、验证结果和报错。
- `summary.json`：每个模型的总通过率、运行时预跑通过率、平均延迟和失败清单。

生成 README 表：

```bash
python training/eval/report.py training/eval/results/command-benchmark-v1-YYYYMMDD-HHMMSS/summary.json
```

## 自动与人工评判

自动门槛由现有工程真实代码执行：JSON 解析、指定主指令、1 或 2-4 条顶层命令、真实资源契约、元素依赖顺序、循环语义，以及 `CommandExecutor` 内存预跑。任何一项失败都不计通过。

自动通过不等于完整需求满足。正式对比后，从下列集合抽样人工试玩：Base 与 Adapter 都通过、仅 Adapter 通过、两者都失败。每组抽 6 个，导入编辑器运行，按 0/1 只记录需求是否被满足、交互是否可完成。文案与布局不属于当前训练目标，也不计入评估。

| 试玩组 | 样本数 | 需求满足 | 可完成交互 | 备注 |
| --- | ---: | ---: | ---: | --- |
| 仅 Adapter 通过 | 6 |  |  |  |
| 两者都通过 | 6 |  |  |  |
| 两者都失败 | 6 |  |  |  |
# Planned held-out benchmark

`heldout_interaction_benchmark_v3.py` remains a deterministic runtime smoke
suite. Do not use it as the formal fine-tune benchmark: its intent templates
are intentionally repetitive.

The formal benchmark is generated once with fixed category quotas, then frozen
for both Base and Adapter. It evaluates the **planner-expanded TASK** that the
DSL model will actually receive in the editor pipeline. Each case also keeps
the original `raw_user_brief` for audit, but that brief is not sent to the DSL
model.

```bash
cd /Users/pippo/github-repo/vibe-game-engine
python3 training/eval/generate_planned_heldout_cases.py --slot 3 --workers 12
```

The generator produces 10 cases each for click, drag, drop, flip, choice,
selection, presentation sequence, click event, auto event, and complex event
coordination. The API can randomize scene theme, resource semantics, wording,
and planner wording only inside those capability cells; the hidden runtime
oracle and category quota remain fixed. It writes a versioned frozen file at
`training/eval/generated_heldout/planned-v1/cases.json`.

Run both models against that exact file:

```bash
python3 training/eval/run_interaction_eval.py --cases training/eval/generated_heldout/planned-v1/cases.json ...
```
