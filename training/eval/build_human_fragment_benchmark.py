#!/usr/bin/env python3
"""Build an eval benchmark JSON from balanced human fragment query records."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "training/eval/generated_human_fragments/v2-balanced/items.jsonl"
DEFAULT_OUTPUT = ROOT / "training/eval/cases/human_fragment_benchmark_v1.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    items = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    cases = []
    for item in items:
        assets = []
        for asset in item.get("assets") or []:
            assets.append({
                "id": asset["id"],
                "type": asset["type"],
                "path": asset["path"],
                "name": asset.get("name") or asset["id"],
                "origin": "human-fragment",
                "exists": True,
            })
        cases.append({
            "id": item["id"],
            "case_kind": "human_fragment",
            "primary_command_type": None,
            "sample_mode": "human_fragment",
            "category": item.get("category"),
            "source_scene_file": item.get("source_scene_file"),
            "source_level": item.get("source_level"),
            "intent": item["task"],
            "asset_catalog": assets,
            "canvas_width": 800,
            "canvas_height": 600,
            "reference_dsl": item["source_dsl"],
            "candidate_id": item.get("candidate_id"),
            "local_rebalance": bool(item.get("local_rebalance")),
            "local_split": bool(item.get("local_split")),
        })
    document = {
        "schema_version": "vge-human-fragment-benchmark-v1",
        "description": "Balanced 100-case benchmark reconstructed from human-authored first-level DSL fragments. The model sees planner-shaped TASK plus ASSETS; reference_dsl is used only for judge/audit.",
        "cases": cases,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "case_count": len(cases)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
