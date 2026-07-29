# 本地微调与评估

本目录与数据合成器分离：`qlora/` 负责在单卡环境训练 PEFT adapter，`eval/` 负责用固定的人类片段 benchmark 比较 Base 和 Adapter。训练脚本不调用教师模型，也不保存 API Key；评估阶段只有 LLM-as-Judge 盲化评审会读取本地 `.env` 中的评审端点。

训练数据只接受通过 DSL 编译、资源契约、元素依赖、控制流静态检查和真实 `CommandExecutor`/Pixi runtime dry-run 的样本。最终 `level-authoring-dsl-v3` 来自合成、DeepSeek/Claude/OpenAI 多轮审查、人工网页核查、API repair 和 final runtime gate 的闭环；`virtual://` 模板样本不会进入正式训练。

建议顺序：

1. 用合成器或人工关卡片段生成候选，并进入多模型审查、人工核查和 runtime gate。
2. 在 `qlora/` 生成 `level-authoring-dsl-v3` chat-format 数据，训练 Qwen3-4B adapter。
3. 在 `eval/` 用同一套 `human_fragment_benchmark_v1` 分别收集 Base 与 Adapter 输出。
4. 先看 parse/compile 与 runtime dry-run，再用 LLM-as-Judge 做盲化 pairwise 语义评审。
5. 后续再构造带隐藏 `oracle.actions/assertions` 的 interaction benchmark，验证点击、拖拽、选择和跨事件真实可玩通过率。
