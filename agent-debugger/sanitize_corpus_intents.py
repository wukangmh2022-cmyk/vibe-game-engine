#!/usr/bin/env python3
"""Audit or atomically normalize source-scene names in the one SFT corpus."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from command_synthesize import normalize_training_intent
from curriculum_plan import DEFAULT_PLAN_PATH, load_curriculum

CORPUS_PATH = REPO_ROOT / "training-data" / "command-agent-sft" / "corpus.jsonl"


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove retrieval-only scene/level names from corpus input intents")
    parser.add_argument("--corpus", default=str(CORPUS_PATH))
    parser.add_argument("--plan", default=str(DEFAULT_PLAN_PATH))
    parser.add_argument("--apply", action="store_true", help="Atomically rewrite the same corpus file")
    args = parser.parse_args()
    corpus_path = Path(args.corpus)
    if not corpus_path.exists():
        parser.error(f"corpus not found: {corpus_path}")
    plan_by_id: dict[str, dict[str, Any]] = {}
    plan_path = Path(args.plan)
    if plan_path.exists():
        plan_by_id = {str(slot["plan_id"]): slot for slot in load_curriculum(plan_path).get("slots", [])}

    changed = 0
    output: list[str] = []
    for line in corpus_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        input_data = record.get("input") if isinstance(record.get("input"), dict) else {}
        before = str(input_data.get("intent") or "")
        after = normalize_training_intent(before, plan_by_id.get(str(record.get("plan_id") or "")))
        if after != before:
            input_data["intent"] = after
            record["input"] = input_data
            changed += 1
        output.append(json.dumps(record, ensure_ascii=False))
    result = {"corpus": str(corpus_path), "records": len(output), "intents_normalized": changed, "applied": args.apply}
    if args.apply:
        temporary = corpus_path.with_suffix(corpus_path.suffix + ".tmp")
        temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
        temporary.replace(corpus_path)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
