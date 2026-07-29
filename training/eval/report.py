#!/usr/bin/env python3
"""Render a concise Markdown Base-vs-Adapter benchmark table."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("summary", help="Path to training/eval/results/.../summary.json")
    args = parser.parse_args()
    data = json.loads(Path(args.summary).read_text(encoding="utf-8"))
    print("| 模型 | 通过/总数 | 自动通过率 | 短指令通过 | 功能块通过 | 运行时预跑通过 | 交互 oracle 通过 | 平均响应秒数 |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for name, row in data["runs"].items():
        command = row.get("by_kind", {}).get("command", {})
        module = row.get("by_kind", {}).get("module", {})
        command_score = f"{command.get('passed', 0)}/{command.get('total', 0)}" if command else "-"
        module_score = f"{module.get('passed', 0)}/{module.get('total', 0)}" if module else "-"
        pass_rate = row.get("pass_rate")
        if not isinstance(pass_rate, (int, float)):
            pass_rate = row["passed"] / row["total"] if row.get("total") else 0
        oracle = f"{row['oracle_passed']}/{row['total']}" if "oracle_passed" in row else "-"
        print(f"| {name} | {row['passed']}/{row['total']} | {pass_rate:.1%} | {command_score} | {module_score} | {row.get('runtime_passed', 0)}/{row['total']} | {oracle} | {row['mean_latency_seconds'] if row['mean_latency_seconds'] is not None else '-'} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
