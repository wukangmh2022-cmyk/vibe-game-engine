#!/usr/bin/env python3
"""Export the final DSL corpus with stable IDs for an independent LLM review."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW_ROW = re.compile(r"^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=ROOT / "training/qlora/data/level-authoring-dsl-v1")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "training-data/dsl-claude-opus-review")
    args = parser.parse_args()

    statuses: dict[str, str] = {}
    review_path = ROOT / "training-data/dsl-manual-review.md"
    for line in review_path.read_text(encoding="utf-8").splitlines():
        match = REVIEW_ROW.match(line)
        if match:
            statuses[match.group(1).strip()] = match.group(2).strip()
    repairs = {
        row["sample_id"]: row
        for row in read_jsonl(ROOT / "training-data/dsl-manual-repairs.jsonl")
    }
    converted = {row["source_id"]: row for row in read_jsonl(args.data_dir / "converted.jsonl")}
    training_rows = read_jsonl(args.data_dir / "train.jsonl") + read_jsonl(args.data_dir / "validation.jsonl")
    output: list[dict] = []
    for row in sorted(training_rows, key=lambda item: item["source_id"]):
        source_id = row["source_id"]
        candidate = converted[source_id]
        output.append({
            "source_id": source_id,
            "messages": row["messages"],
            "asset_catalog": candidate["asset_catalog"],
            "gold_dsl": candidate["dsl"],
            "local_review_status": statuses[source_id],
            "local_repair_reason": repairs.get(source_id, {}).get("reason", ""),
        })
    if len(output) != 1282 or len({row["source_id"] for row in output}) != len(output):
        raise ValueError("review export must contain exactly 1282 unique source IDs")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    corpus_path = args.output_dir / "corpus.jsonl"
    corpus_path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in output), encoding="utf-8")
    print(json.dumps({"output": str(corpus_path), "rows": len(output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
