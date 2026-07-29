#!/usr/bin/env python3
"""Join DeepSeek A/B judgments with the current reviewed DSL corpus."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW_ROW = re.compile(r"^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    audit_path = ROOT / "training-data/dsl-quality-audit/all-results.jsonl"
    data_dir = ROOT / "training/qlora/data/level-authoring-dsl-v1"
    current_path = data_dir / "converted.jsonl"
    output_path = ROOT / "training-data/dsl-claude-opus-review/deepseek-vs-current.jsonl"
    current = {row["source_id"]: row for row in read_jsonl(current_path)}
    current_messages = {
        row["source_id"]: row["messages"]
        for row in read_jsonl(data_dir / "train.jsonl") + read_jsonl(data_dir / "validation.jsonl")
    }
    statuses: dict[str, str] = {}
    for line in (ROOT / "training-data/dsl-manual-review.md").read_text(encoding="utf-8").splitlines():
        match = REVIEW_ROW.match(line)
        if match:
            statuses[match.group(1).strip()] = match.group(2).strip()
    output: list[dict] = []
    for audit in read_jsonl(audit_path):
        source_id = audit["source_id"]
        now = current.get(source_id)
        output.append({
            "source_id": source_id,
            "deepseek_comparison": audit,
            "current_status": statuses.get(source_id, "MISSING"),
            "current_training_record": None if now is None else {
                "system": current_messages[source_id][0]["content"],
                "user": current_messages[source_id][1]["content"],
                "intent": now["intent"],
                "asset_catalog": now["asset_catalog"],
                "gold_dsl": now["dsl"],
            },
        })
    if len(output) != 1283 or len({row["source_id"] for row in output}) != len(output):
        raise ValueError("DeepSeek review export must contain 1283 unique source IDs")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in output), encoding="utf-8")
    print(json.dumps({"output": str(output_path), "rows": len(output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
