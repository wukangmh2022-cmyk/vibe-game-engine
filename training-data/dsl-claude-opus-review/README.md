# Claude Opus 独立复核说明

逐行读取 `corpus.jsonl`。必须同时阅读完整 `system`、`user`、`assistant`、`asset_catalog` 和 `gold_dsl`，不得只按语法或本地既有结论打分。

每条检查：真实用户意图是否完整实现；资源 ID/type/path 是否匹配；元素是否先创建再引用；交互是否真实可触发；初始内容是否会被立即覆盖；循环是否可退出；外部 signal 是否由 user 明确声明；BGM 与 SE 角色是否正确；是否猜测 query 未给出的数值、文案、坐标或行为；输出是否仅含合法 VGE-DSL/1。

本地 `local_review_status` 和 `local_repair_reason` 只用于定位历史，不代表正确答案。请独立判断，不要因本地标为 PASS 而放宽标准。

输出 JSONL，每条固定格式：

```json
{"source_id":"...","verdict":"PASS|GOLD_WORSE|UNCERTAIN","severity":"high|medium|low|none","reasons":["具体原因"],"suggested_intent":"仅需修改时填写","suggested_dsl":"仅需修改时填写"}
```

要求覆盖全部 1282 个唯一 `source_id`。不要修改原文件；把结果另存为 `opus-results.jsonl`。
