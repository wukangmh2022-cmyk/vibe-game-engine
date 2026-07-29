#!/usr/bin/env python3
"""Merge current quality repairs with API accepted repairs for a next dataset version."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = ROOT / "training-data/dsl-v2-quality-repairs.jsonl"
DEFAULT_API = ROOT / "training-data/dsl-v3-api-repair/accepted-repairs.jsonl"
DEFAULT_OUTPUT = ROOT / "training-data/dsl-v3-api-repairs-merged.jsonl"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--api", type=Path, default=DEFAULT_API)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for row in read_jsonl(args.base):
        sid = str(row["source_id"])
        merged[sid] = row
        order.append(sid)
    api_rows = read_jsonl(args.api)
    for row in api_rows:
        sid = str(row["source_id"])
        clean = {
            "source_id": sid,
            "action": row.get("action", "FIX"),
            "intent": row.get("intent", ""),
            "asset_catalog": row.get("asset_catalog", []),
            "dsl": row.get("dsl", ""),
            "reason": row.get("reason", "API repair"),
        }
        if sid not in merged:
            order.append(sid)
        merged[sid] = clean

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(merged[sid], ensure_ascii=False) + "\n" for sid in order if sid in merged),
        encoding="utf-8",
    )
    print(json.dumps({
        "base_rows": len(read_jsonl(args.base)),
        "api_rows": len(api_rows),
        "merged_rows": len(merged),
        "output": str(args.output),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
