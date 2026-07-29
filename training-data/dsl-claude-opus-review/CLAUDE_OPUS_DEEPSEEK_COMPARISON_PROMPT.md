复核 `deepseek-vs-current.jsonl` 中已经完成的 DeepSeek V4 Flash A/B 质量审计，共 1283 条。

每条记录包含：

- `deepseek_comparison.original_system` 和 `original_user`：DeepSeek 审计当时使用的完整输入。
- `deepseek_comparison.gold_response`：当时训练集的旧答案。
- `deepseek_comparison.candidate`：DeepSeek 独立生成的对照答案。
- `deepseek_comparison.judgment`：DeepSeek 给出的比较结论和原因。
- `deepseek_comparison.gold_position`、`gold_worse` 及双方 local check。
- `current_training_record.system`、`user`、`gold_dsl`：当前训练集实际使用的完整输入和答案。
- `current_training_record=null` 表示该条当前已排除。

只使用记录中对应的系统提示词和用户消息作为判断标准，不添加其它规则、偏好或重点审查项：

- 使用 `original_system + original_user` 判断旧 gold、candidate 以及 DeepSeek judgment 是否正确。
- 使用 `current_training_record.system + current_training_record.user` 判断当前 gold 是否正确。
- 不以 `current_status`、本地 repair reason、答案长度或命令数量作为正确性依据。

逐条输出 JSONL：

```json
{"source_id":"...","old_comparison":"old_gold|candidate|tie|neither","deepseek_verdict":"AGREE|OVERTURN|PARTIAL","current_verdict":"CORRECT|INCORRECT|EXCLUDED_CORRECTLY|EXCLUSION_QUESTIONABLE","reason":"判断原因","suggested_current_dsl":"当前答案错误时填写，否则为空字符串"}
```

必须覆盖全部 1283 个唯一 `source_id`，不得抽样。结果写入 `opus-deepseek-review-results.jsonl`。完成后检查输出恰好 1283 行、无重复、无缺失，并汇总各 verdict 数量。
