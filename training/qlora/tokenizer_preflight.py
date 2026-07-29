#!/usr/bin/env python3
"""Measure the exact training serialization and reject context truncation."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from transformers import AutoTokenizer


def percentile(values: list[int], quantile: float) -> int:
    return sorted(values)[max(0, math.ceil(len(values) * quantile) - 1)]


def chat_text(tokenizer, messages: list[dict[str, str]]) -> str:
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name-or-path", required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("training/qlora/data/level-authoring-dsl-v1"))
    parser.add_argument("--max-length", type=int, default=1536)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    tokenizer = AutoTokenizer.from_pretrained(args.model_name_or_path, trust_remote_code=True, use_fast=False)
    lengths: list[int] = []
    assistant_lengths: list[int] = []
    over_limit: list[dict[str, int | str]] = []
    for filename in ("train.jsonl", "validation.jsonl"):
        for line in (args.data_dir / filename).read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            messages = row["messages"]
            prompt = chat_text(tokenizer, messages[:-1])
            full = prompt + messages[-1]["content"] + (tokenizer.eos_token or "")
            prompt_length = len(tokenizer(prompt, add_special_tokens=False)["input_ids"])
            full_length = len(tokenizer(full, add_special_tokens=False)["input_ids"])
            assistant_length = full_length - prompt_length
            lengths.append(full_length)
            assistant_lengths.append(assistant_length)
            if full_length > args.max_length:
                over_limit.append({"id": row.get("id", ""), "tokens": full_length})
            if assistant_length <= 0:
                raise ValueError(f"{row.get('id')} has no supervised assistant tokens")
    report = {
        "model": args.model_name_or_path,
        "enable_thinking": False,
        "max_length": args.max_length,
        "rows": len(lengths),
        "min_tokens": min(lengths),
        "p95_tokens": percentile(lengths, 0.95),
        "p99_tokens": percentile(lengths, 0.99),
        "max_tokens": max(lengths),
        "min_assistant_tokens": min(assistant_lengths),
        "max_assistant_tokens": max(assistant_lengths),
        "over_limit": over_limit,
    }
    report_path = args.report or args.data_dir / "tokenizer-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if not over_limit else 1


if __name__ == "__main__":
    raise SystemExit(main())
