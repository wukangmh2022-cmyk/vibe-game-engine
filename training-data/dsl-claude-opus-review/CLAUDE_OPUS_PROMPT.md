你是一名严格的游戏关卡 DSL 训练数据审计员。请独立复核随附的 `corpus.jsonl`，总计 1282 条。不要相信或迎合本地已有结论，也不要因为样本能通过 parser/runtime 就判定语义正确。

对每一行必须完整阅读：

1. `messages[0]`：完整系统 Guidance 与 DSL 契约。
2. `messages[1]`：真实 TASK、CANVAS、ASSETS。
3. `messages[2]` / `gold_dsl`：待审计的标准答案。
4. `asset_catalog`：资源 ID、类型与路径。

逐条判断 gold 是否忠实、完整、最小化地实现 user 的真实意图，重点检查：

- 是否猜测 TASK 未给出的数值、阈值、坐标、文案、资源或行为。
- 图片、音频、动画、皮肤是否只引用本条 ASSETS 中类型匹配且非空的 ID。
- `audio/bgm/` 是否只用于 BGM，`audio/se/` 是否只用于 SE；旁白、问诊、问题、掌声和短反馈不得伪装成背景音乐。
- 元素是否先创建再更新、交互或动画。
- 声称按钮、选择、点击、拖拽时，是否存在真实可触发交互，而不是只显示图片或立即改字。
- `TEXT` 是否下一行就被 `TEXT_SET` 覆盖，导致首句不可见。
- 外部 `ON signal` 是否由 TASK 明确声明；不得凭空发明 runtime signal。
- 循环是否有状态更新或可达退出；条件分支是否存在永远不可达的死分支。
- `AUTO` 是否仅用于 TASK 明确要求的立即启动行为。
- BGM/SE 是否有合理生命周期；不得启动后在同一时刻停止。
- 是否绕过用户真实需求，只实现容易评分的表面命令。
- DSL 是否严格符合 system Guidance，且只输出 DSL，不含 JSON、Markdown、解释或 thinking。

`local_review_status` 和 `local_repair_reason` 只是历史定位信息，不能作为正确性证据。请先独立判断，再查看它们是否暴露遗漏。

输出必须是 JSONL，一条输入对应一条输出，固定格式：

```json
{"source_id":"phase1-g0000","verdict":"PASS|GOLD_WORSE|UNCERTAIN","severity":"high|medium|low|none","categories":["intent|resource|interaction|control_flow|timing|syntax|data_quality"],"reasons":["具体、可验证的问题"],"suggested_intent":"仅需修改时填写完整 TASK，否则为空字符串","suggested_dsl":"仅需修改时填写完整 DSL，否则为空字符串"}
```

硬性要求：

- 覆盖全部 1282 个唯一 `source_id`，不得跳过、抽样或合并。
- 不要直接修改输入文件；结果写入 `opus-results.jsonl`。
- `PASS` 必须使用 `severity=none`、空 `reasons`、空建议。
- 不能确定引擎行为时使用 `UNCERTAIN`，明确写出需要核对的 runtime 契约。
- 每处理 100 条报告一次累计进度，但不要停止，直到 1282 条全部完成。
- 完成后校验输出恰好 1282 行、source_id 无重复无缺失，并汇总各 verdict/category 数量。
