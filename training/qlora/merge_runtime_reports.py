#!/usr/bin/env python3
"""Merge bounded runtime validation shards into one complete quality report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reports", type=Path, nargs="+")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    reports = [json.loads(path.read_text(encoding="utf-8")) for path in args.reports]
    base = dict(reports[0])
    results = [result for report in reports for result in report.get("runtime_results", [])]
    expected = {
        json.loads(line)["source_id"]
        for line in (args.data_dir / "converted.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    actual = [str(result.get("source_id", "")) for result in results]
    if len(actual) != len(set(actual)) or set(actual) != expected:
        raise ValueError("runtime shards do not exactly cover unique converted source IDs")
    if not all(result.get("valid") for result in results):
        raise ValueError("at least one runtime shard contains a failed sample")
    for report in reports[1:]:
        for field in ("converted_rows", "train_rows", "validation_rows", "static_valid", "warnings"):
            if report.get(field) != base.get(field):
                raise ValueError(f"runtime shard disagrees on {field}")
    base["runtime_executed"] = True
    base["runtime_valid"] = True
    base["runtime_results"] = sorted(results, key=lambda result: result["source_id"])
    base["errors"] = {}
    args.output.write_text(json.dumps(base, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "runtime_rows": len(results)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
