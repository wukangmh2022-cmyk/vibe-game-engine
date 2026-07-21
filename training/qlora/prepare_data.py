#!/usr/bin/env python3
"""Filter verified command-agent JSONL records and create reproducible SFT splits."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SYSTEM = """你是 Vibe Game Engine 的关卡指令生成器。只输出 JSON 对象，字段为 intent、asset_catalog、commands。严格使用给定资源，禁止虚构路径、网络接口、登录、上传、脚本和未定义指令。"""


def verified(record: dict[str, Any]) -> bool:
    validation = record.get("validation")
    return isinstance(validation, dict) and validation.get("valid") is True and (validation.get("runtime") or {}).get("valid") is True


def render_user(record: dict[str, Any]) -> str:
    payload = record.get("input") or {}
    return "\n".join([
        "需求：" + str(payload.get("intent", "")),
        "可用资源（只可使用这些 id/type/path，若无资源则保持空数组）：",
        json.dumps(payload.get("asset_catalog", []), ensure_ascii=False, separators=(",", ":")),
    ])


def render_assistant(record: dict[str, Any]) -> str:
    return json.dumps({
        "intent": record["input"]["intent"],
        "asset_catalog": record["input"].get("asset_catalog", []),
        "commands": record["output"]["commands"],
    }, ensure_ascii=False, separators=(",", ":"))


def load_records(paths: list[Path]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    seen: set[str] = set()
    accepted: list[dict[str, Any]] = []
    stats = {"read": 0, "accepted": 0, "skipped_unverified": 0, "skipped_duplicate": 0, "skipped_invalid": 0}
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            stats["read"] += 1
            try:
                record = json.loads(line)
                if not verified(record):
                    stats["skipped_unverified"] += 1
                    continue
                sample = {"input": record["input"], "output": record["output"]}
                fingerprint = hashlib.sha256(json.dumps(sample, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
                if fingerprint in seen:
                    stats["skipped_duplicate"] += 1
                    continue
                seen.add(fingerprint)
                accepted.append({
                    "id": record.get("sample_id", fingerprint[:12]),
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": render_user(record)},
                        {"role": "assistant", "content": render_assistant(record)},
                    ],
                    "primary_command_type": record.get("primary_command_type"),
                    "sample_mode": record.get("sample_mode"),
                })
            except (KeyError, TypeError, json.JSONDecodeError):
                stats["skipped_invalid"] += 1
    stats["accepted"] = len(accepted)
    return accepted, stats


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", nargs="+", required=True, help="Verified command-agent JSONL file(s) or directories")
    parser.add_argument("--output-dir", default="training/qlora/data/command-sft-v1")
    parser.add_argument("--validation-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if not 0 < args.validation_ratio < 0.5:
        parser.error("validation-ratio must be between 0 and 0.5")

    files: list[Path] = []
    for raw in args.input:
        path = Path(raw)
        files.extend(sorted(path.glob("*.jsonl")) if path.is_dir() else [path])
    files = [path for path in files if path.is_file()]
    rows, stats = load_records(files)
    if len(rows) < 20:
        raise SystemExit(f"only {len(rows)} verified records; collect at least 20 before creating a split")
    ordered = sorted(rows, key=lambda row: hashlib.sha256(f"{args.seed}:{row['id']}".encode()).hexdigest())
    validation_size = max(1, round(len(ordered) * args.validation_ratio))
    validation, train = ordered[:validation_size], ordered[validation_size:]
    out = Path(args.output_dir)
    write_jsonl(out / "train.jsonl", train)
    write_jsonl(out / "validation.jsonl", validation)
    (out / "manifest.json").write_text(json.dumps({**stats, "sources": [str(path) for path in files], "train": len(train), "validation": len(validation), "seed": args.seed}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**stats, "output_dir": str(out), "train": len(train), "validation": len(validation)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
