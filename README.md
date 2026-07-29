# Vibe Game Engine

Vibe Game Engine 是一个数据驱动的 2D 游戏运行时和 Web 关卡编辑器。该项目将游戏内容表示为 JSON 场景、资源、事件和指令，使关卡逻辑可以由可视化编辑器、AI 生成结果或配置文件组织，而不依赖分散的业务代码。

该项目提供覆盖资源管理、场景配置、指令树、事件编排和 Pixi 运行时预览的可视化编辑器。编辑器支持以无代码方式组合画面、动画、音频、点击、拖拽、条件分支和关卡跳转，并将编辑结果保存为可由同一运行时执行的关卡数据。

该项目在编辑器中集成 AI 关卡生成模块。模块根据当前画布和可用资源生成紧凑的 `VGE-DSL/1`，再由编辑器的确定性解析器编译为现有 `commands + extra_events` JSON；游戏保存格式和运行时协议不变。配套模型使用经过人工语义审查、资源契约检查和真实运行时验证的中文“需求 -> DSL”数据微调。

## 在线使用

- [在线编辑器](https://wukangmh2022-cmyk.github.io/vibe-game-engine/editor/)
  打开本地项目文件夹后即可编辑场景、资源和事件。工程会保存在浏览器缓存或用户授权的本地文件夹中，可在之后继续开发，并随时导出完整 `project.zip`。
- [智慧健脑客户示例](https://wukangmh2022-cmyk.github.io/vibe-game-engine/)
  面向客户的静态试玩版，已移除登录、账号、进度同步和分数上传。

## AI 生成关卡

编辑器的 AI 面板将关卡需求、800x600 画布和已选资源整理为统一的 `TASK/CANVAS/ASSETS` 消息。填写自己的 OpenRouter API Key 后，模型返回 `VGE-DSL/1`；编辑器先解析并校验 DSL，再编译为可写入关卡的 JSON。密钥只保存在当前浏览器，不会提交到项目或 GitHub Pages。生成结果仍可在指令树中逐条调整，并立刻在右侧 Pixi 画布预览。

典型流程：描述玩法 -> 选择要引用的图片、音频或动画资源 -> 生成关卡指令 -> 在预览中验证 -> 保存或导出工程。

## 指令模型实验

仓库包含一条面向本引擎 DSL 的可复现实验链路：原始 JSON 指令语料经逐条人工审查和显式修复后转换为 token-efficient DSL，以 QLoRA 微调开源基础模型，最后在固定 held-out 题集上比较 Base 与 Adapter。训练答案只包含可编译 DSL，不包含 JSON、解释或 Thinking。

完整说明与脚本在 [training/README.md](training/README.md)，分为 `agent-debugger/`、`training/qlora/` 和 `training/eval/` 三部分。关于 15 个已试玩人类关卡、一期多 worker 队列合成、二期跨事件补齐、三期浏览器互动补齐和 DSL v3 审查修复，见下方数据合成与质量门、[训练数据人工审查台账](training-data/dsl-manual-review.md) 和 [DSL v3 manifest](training/qlora/data/level-authoring-dsl-v3/manifest.json)。

正式 chat-format 数据、转换档案、manifest、runtime 质量报告和 tokenizer 报告位于 [training/qlora/data/level-authoring-dsl-v3](training/qlora/data/level-authoring-dsl-v3)。

### 数据合成与质量门

最终 4B DSL v3 数据不是一次性批量生成，而是“合成 -> 多模型审查 -> 人工核查 -> API 修复 -> runtime gate”的闭环。原始来源包括 15 个真实人类关卡、一阶段功能片段、二阶段事件协调样本和三阶段浏览器交互补齐样本；随后统一转换为 `VGE-DSL/1`，再用人工审查网页、DeepSeek/Claude/OpenAI 多轮 judge、Slot 3 API repair 和本地编译器/runtime 把 query、ASSETS 与 DSL 一起修到一致。

最终 `level-authoring-dsl-v3` 数据链路如下：

| 阶段 | 数量 | 说明 |
| --- | ---: | --- |
| 源候选 | 1282 | 来自真实关卡片段、功能片段、事件协调和交互补齐 |
| 转换后保留 | 1265 | 17 条因 final runtime gate 仍非终止、malformed 或无法可靠验证而排除 |
| 训练集 | 1139 | 与验证集按 `source_id` 切分，不跨集合 |
| 验证集 | 126 | 只用于 loss/过拟合观察，不作为最终泛化分数 |
| 修复动作 | KEEP 183 / FIX 1082 / EXCLUDE 17 | 反映绝大多数样本都经过显式语义或运行时修复 |
| 额外质量修复记录 | 972 | 来自多轮人工批注、DeepSeek/Claude/Slot 3 审查与 API repair 合并 |

准入不是只检查语法。正式样本必须通过 DSL parse、serialize/reparse 结构往返、资源 ID/type/path 契约、元素与控制流静态检查，以及仓库真实 `CommandExecutor` 和浏览器/Pixi handler 的 runtime dry-run。资源 ID 从文件名生成语义名称，重复项追加编号；空资源、纯下划线 ID、悬空 `JUMP_ID`、未注册命令、无法终止循环和未创建元素即交互绑定都不能进入最终训练文件。

每条正式消息固定为三段：system 使用编辑器与评估共享的完整 V3 Guidance；user 使用 `TASK + CANVAS + ASSETS(id | type | path)`；assistant 只输出 DSL。训练、推理和评估均显式设置 `enable_thinking=false`。人工与机器审查保留版本化 ledger，不覆盖原始数据；正式数据和报告见 [level-authoring-dsl-v3](training/qlora/data/level-authoring-dsl-v3)、[quality-report.json](training/qlora/data/level-authoring-dsl-v3/quality-report.json) 与 [dsl-manual-review.md](training-data/dsl-manual-review.md)。

如需继续合成候选，教师采集入口仍为低层工具；新候选必须再进入同样的多轮审查和 runtime gate，不能直接合入训练集：

```bash
export VIBE_TEACHER_API_BASE=http://HOST/v1
export VIBE_TEACHER_API_KEY=your-key
export VIBE_TEACHER_MODEL=teacher-model-id

python3 agent-debugger/command_synthesize.py \
  --samples 100 --workers 4 --max-actions 20 --timeout 180
```

### QLoRA 微调

当前第一阶段使用 Qwen3-4B-Instruct-2507 做单卡 QLoRA：LoRA `r=32`、`alpha=64`、micro batch `1`、梯度累积训练，学习率 `1e-4`，3 epoch。DSL v3 精确 tokenizer 预检最终使用 `max_length=2048`，最长样本已压缩到 2048 以内，训练代码禁止静默截断，并按 `eval_loss` 恢复最佳 checkpoint。27B 只在 4B 固定评估取得稳定正增益后训练，建议使用 `r=64`、`alpha=128` 和至少 48 GB 显存。

AutoDL 分为无显卡准备和 GPU 训练两个阶段。准备脚本安装隔离依赖、下载完整基础模型并重跑 tokenizer 门禁；GPU 脚本不允许临时下载，缺环境或模型会立即退出：

```bash
# 无显卡模式
MODEL_DIR=/root/training/models/Qwen3-4B-Instruct-2507 \
  bash training/qlora/prepare_qwen35_4b.sh

# 看到 READY_FOR_GPU 后切换 GPU
set -o pipefail
MODEL_DIR=/root/training/models/Qwen3-4B-Instruct-2507 \
  bash training/qlora/run_qwen35_4b.sh 2>&1 \
  | tee training/qlora/qwen3-4b-dsl-v3-train.log
```

训练产物位于 `training/qlora/outputs/vibe-level-qwen3-4b-dsl-v3`，是 PEFT adapter，不是完整基础模型。发布时上传 adapter、训练配置、数据 manifest 和评估报告；基础模型保持引用原始模型名。

### 固定评估

当前正式评估不再使用旧的 36 条短指令题或模板化 intent 作为泛化结论。那些集合仍可作为引擎回归 smoke test，但它们题面重复、资源分布固定，无法衡量小模型是否真正学会把“工程化关卡需求 + 资源清单”映射成可执行 DSL。

新的主评估集是 `human_fragment_benchmark_v1`：从 15 个已试玩人类游戏的第一关 DSL 中抽取 100 个片段，按真实关卡轨迹覆盖 UI 初始化、变量状态、事件信号、点击/选择/拖拽、动画过渡、文本更新、计时、音效、场景跳转和循环控制。每条 case 保留人类片段的 `reference_dsl` 作为语义锚点，并把该片段实际依赖的资源整理为 `asset_catalog`。模型看到的输入仍是编辑器最终会发送的格式：

```text
system: LEVEL_PATCH_PROMPT_V3
user:
TASK
<工程化关卡需求>
CANVAS 800 600
ASSETS id | type | path
<本题资源>
```

Base 与 Adapter 的对照严格保持同分布：同一条 system Guidance、同一条 user prompt、同一资源清单、同一基座 tokenizer、`temperature=0`、`enable_thinking=false`。唯一自变量是是否在同一 Qwen3-4B-Instruct-2507 基座上挂载 `vibe-level-qwen3-4b-dsl-v3` LoRA。两条超长 prompt 因 `prompt + max_tokens=768` 超过 2048 上下文，两组都用同样的 `max_tokens=512` 补跑，避免输出预算成为偏差来源。

评估分三层，分别回答不同问题：

1. DSL parse/compile：能否被确定性 DSL 编译器还原成 `commands + extra_events`，并满足资源 ID/type/path、元素依赖和控制流基本契约。
2. Runtime dry-run：对可解析输出，用真实 `CommandExecutor`、事件系统和 Pixi/browser handler 执行主流程。它会发现元素未创建就绑定点击、资源/handler 参数不匹配等运行时错误；但由于这组 human-fragment case 没有隐藏 `oracle.actions/assertions`，dry-run 不注入点击、拖拽或选择动作，不能等同于完整交互通过率。
3. Slot 3 盲化语义评审：使用 `gpt-5.6-terra` 对 A/B 两个匿名候选做 pairwise judge。Judge 不知道候选来自 Base 还是 Adapter，只看 TASK、ASSETS、reference DSL、A/B 原始 DSL 和 parse 状态，按需求覆盖、行为正确性、资源落地、交互反馈、布局呈现和语法可执行性给分并判定胜负。

结果产物：

- 测试集：[training/eval/cases/human_fragment_benchmark_v1.json](training/eval/cases/human_fragment_benchmark_v1.json)
- Adapter 生成：[training/eval/results/adapter-human-fragment-v1/generations.complete.jsonl](training/eval/results/adapter-human-fragment-v1/generations.complete.jsonl)
- Base 生成：[training/eval/results/base-human-fragment-v1/generations.complete.jsonl](training/eval/results/base-human-fragment-v1/generations.complete.jsonl)
- Adapter runtime dry-run：[training/eval/results/adapter-human-fragment-v1/generations.runtime-dry-run.jsonl](training/eval/results/adapter-human-fragment-v1/generations.runtime-dry-run.jsonl)
- Base runtime dry-run：[training/eval/results/base-human-fragment-v1/generations.runtime-dry-run.jsonl](training/eval/results/base-human-fragment-v1/generations.runtime-dry-run.jsonl)
- Slot 3 盲评：[training/eval/results/human-fragment-v1-slot3-judge/summary.json](training/eval/results/human-fragment-v1-slot3-judge/summary.json)
- 盲评脚本：[training/eval/judge_human_fragment_pairwise.py](training/eval/judge_human_fragment_pairwise.py)

| 指标 | Adapter + Guidance | Base + Guidance | 结论 |
| --- | ---: | ---: | --- |
| 有效生成条数 | 100 / 100 | 100 / 100 | 两组均完整返回 |
| DSL parse/compile 通过 | 96 / 100 | 37 / 100 | Adapter 明显更稳定 |
| Runtime dry-run 通过 | 83 / 100 | 37 / 100 | Adapter 主流程执行仍明显领先 |
| Slot 3 平均 overall 分 | 6.931 | 3.384 | Adapter 更贴合需求 |
| 盲评胜出 | 82 | 10 | 另有 tie 7、neither 1 |
| 公共可解析子集 | 37 条 | 37 条 | 双方都合法时再比较语义 |
| 公共子集盲评胜出 | 21 | 9 | 另有 tie 7 |
| 公共子集平均 overall | 7.600 | 6.359 | 排除格式失败后 Adapter 仍领先 |

Base 的大量失败不是网络或截断导致：两组都有完整 `raw_output`，Base 失败样本的 completion token 通常远低于输出上限。抽查显示主要是 DSL 语法和资源契约问题，例如给资源 ID 误加引号、动画参数格式错误、JSON/animation 子字段不完整、条件表达式写成 DSL 不支持的 `&&`。因此报告同时保留两种口径：全量口径衡量生产可用率，失败也必须计入；公共可解析子集衡量“双方都已经能生成合法 DSL 时，谁更符合 query 和 reference 语义”。

Adapter 的 13 条“可解析但 dry-run 失败”主要集中在交互与文本类片段，典型原因是对 `introduce`、`submit-btn`、`show_image_1` 等元素先绑定点击/选择但没有先创建。这说明 4B SFT 已经显著学到 DSL 格式、资源引用和多数流程结构，但下一轮仍要强化元素生命周期：先创建可见元素，再绑定 CLICK/SELECT/DRAG/STYLE/TEXT_SET。

按当前 100 条人类片段对照，4B DSL v3 SFT 已显示明确正增益：它不仅提升了格式服从和资源引用稳定性，也在真实引擎主流程 dry-run 以及双方都可解析样本的盲化语义比较中继续领先。更严格的下一步是重新构造带隐藏 `oracle.actions/assertions` 的 interaction benchmark，验证这种优势是否完整转化为点击、拖拽、选择和跨事件断言下的真实可玩交互完成率。

### 下一步

当前第一阶段已完成 4B DSL v3 的单变量 SFT 对照：同一 4B Base 与挂载 LoRA Adapter 使用逐字一致的 Guidance、TASK、CANVAS、ASSETS 和推理参数进行比较。Adapter 在 DSL 可解析率、runtime dry-run、Slot 3 盲化语义评审以及公共可解析子集上均稳定优于 Base，因此可以把这一版视为第一阶段成功闭环。下一步不急于直接扩大到 27B；应先补带隐藏 `oracle.actions/assertions` 的真实交互 benchmark，专门压测点击、拖拽、选择、跨事件信号和元素生命周期。现阶段不使用 RL；若 SFT 已建立稳定正增益但仍有可重复偏差，优先考虑由编译器、runtime、盲评和人工复核证据构造 chosen/rejected 的离线 DPO，而不是纯主观奖励。

未来 TODO：把“真实用户口语需求 -> 可训练 DSL”拆成两层，而不是要求小模型直接从一句短口语里猜完整变量、流程和资源使用。第一层是最终 runtime 也会使用的规划扩句提示词：用和当前训练目标一致的同型号/同系列模型，最好是同一基座模型，把用户原话扩成工程化任务说明。这个同分布约束是核心：只有同一类模型才知道自己更自然地说“把开关打开”“把变量设为 true”还是别的表述；数据合成时不强行改写它的口语风格，而是顺着该模型自己的语言分布生成 query。规划扩句提示词只约束它必须讲清初始化变量、状态开关、顺序流程、分支/跳转、循环退出、资源引用和交互反馈；同时只用引擎能力的自然词汇描述能力边界，例如显示图片/文本/按钮/选项、移动图片、透明度或缩放变化、播放入场/循环/出场动画、翻牌、音效、背景音乐、变量判断和下一关。第二层再由 SFT 小模型学习“工程化任务说明 + ASSETS -> VGE-DSL/1”的稳定映射。

这条路线不强行统一口语表达。像“打开某个开关”和“把某变量设为 true”这类同义表达，应保留真实分布；规划扩句模型负责把口语意图自然地落到变量和流程上，而不是让训练 query 全部变成机械日志。更理想的数据合成流程是：frontier model 先生成可试玩的完整关卡 DSL/JSON 组合，经过 runtime 和人工试玩确认正确，再反向拆解出自然但精确的规划说明，标出每段描述对应的 DSL 指令片段。这样得到的 SFT 样本既有同分布自然表述，又有经过测试的明确指令轨迹；后续 DPO 再使用编译器、runtime、试玩和盲评证据构造 chosen/rejected。

## 功能概览

- 自动组织资源：读取项目资源、类型、路径和图片尺寸，降低资源引用错误。
- 指令化游戏逻辑：通过 `show_text`、`show_image`、`show_button`、`show_choices`、`set_variable`、`if_condition`、`loop`、`scene_redirect` 等指令组织玩法。
- 可视化编辑器：提供项目首页、场景列表、命令树、事件面板、变量/开关管理、资源选择和 Pixi 预览画布。
- 运行时预览：同一份 JSON 可在编辑器中预览，也可通过独立 runtime 页面运行。
- 事件和交互：支持按钮、选择项、拖拽、区域检测、条件分支、变量状态和场景跳转。
- RPG 图片地图：主分支包含实验性图片地图、角色移动、碰撞遮罩和前景遮挡层，详见 [RPG 图片地图运行时](docs/rpg-image-map-runtime.md)。

## Screenshots

### 可视化关卡编辑

![Vibe Game Engine 编辑器工作台](docs/images/editor-workspace.png)

### AI 生成关卡指令

![AI 关卡生成与资源引用面板](docs/images/ai-level-generation.png)

## 技术栈

- TypeScript
- React
- PixiJS runtime/editor integration
- Webpack editor build
- Jest + ts-jest
- AJV schema validation
- EventEmitter3

## 工程结构

```text
src/
├── core/                       # GameRuntime、CommandExecutor、状态、事件、资源管理
├── commands/                   # 通用命令处理器
├── browser/                    # Pixi 浏览器渲染与交互处理器
├── handlers/                   # 拖拽、区域检测等扩展处理器
└── types/                      # 运行时类型定义

level-editor/
├── src/App.tsx                 # 编辑器主界面
├── src/components/             # 命令、事件、变量、资源、AI 生成等面板
├── src/runtime/                # 编辑器内 Pixi 预览运行时
└── public/                     # 编辑器和 runtime HTML 模板
```

## 本地开发

```bash
npm install
npm run build
npm start
```

## GitHub Pages 发布

`customer-demo/` 是智慧健脑的静态客户版本，默认进入健脑训练菜单，全部本地关卡可用，且不含登录、账号、进度同步和分数上传指令。GitHub Actions 会在 `main` 每次推送后构建客户示例与在线编辑器，并发布到 GitHub Pages。

本地构建 Pages 产物：

```bash
npm run build:customer-demo
```

产物位于 `gh-pages/`，部署工作流见 `.github/workflows/deploy-customer-demo.yml`。首次启用时，请在仓库 Settings 的 **Pages > Build and deployment** 中选择 **GitHub Actions**。
