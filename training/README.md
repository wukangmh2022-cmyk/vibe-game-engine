# 本地微调与评估

本目录与数据合成器分离：`qlora/` 负责在 AutoDL 的单卡环境训练 PEFT adapter，`eval/` 负责用固定题集比较原模型和 adapter。两者都不调用教师模型，也不保存 API Key。

训练和评估只接受通过 `agent-debugger/command_validator.py` 的可执行样本：真实资源、资源路径存在、指令依赖成立，并且已通过 `CommandExecutor` 内存预跑。`virtual://` 模板样本不会进入这个流程。

建议顺序：

1. 用合成器生成并验证 JSONL。
2. 在 `qlora/` 准备、切分数据，训练 adapter。
3. 在 `eval/` 用同一套 36 个固定任务分别运行 Base 和 Adapter。
4. 只挑机器评分通过的差异案例进入编辑器试玩；试玩用来判断玩法、文案和视觉布局，不能替代结构与运行时检查。
