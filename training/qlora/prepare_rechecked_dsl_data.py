#!/usr/bin/env python3
"""Build an isolated DSL V2 corpus from the fully rechecked V1 corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.dsl.level_dsl import compile_patch, normalize_for_comparison, parse_program, serialize_patch
from training.eval.editor_prompt import editor_system_prompt
from training.eval.user_prompt import render_level_dsl_user_prompt
from training.qlora.data_contract import prompt_sha256
from training.qlora.validate_dsl_corpus import audit_row


DEFAULT_BASE = ROOT / "training/qlora/data/level-authoring-dsl-v1"
DEFAULT_RECHECK = ROOT / "training-data/deepseek-manual-recheck.jsonl"
DEFAULT_WORK_DIR = ROOT / "training-data/dsl-v2-repair"
DEFAULT_OUTPUT = ROOT / "training/qlora/data/level-authoring-dsl-v2"
DEFAULT_EXTRA_REPAIRS = ROOT / "training-data/dsl-v2-quality-repairs.jsonl"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def keyed(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row.get(key, ""))
        if not value or value in result:
            raise ValueError(f"missing or duplicate {key}: {value!r}")
        result[value] = row
    return result


def initialize(base_dir: Path, recheck_path: Path, work_dir: Path) -> None:
    base = keyed(read_jsonl(base_dir / "converted.jsonl"), "source_id")
    recheck = keyed(read_jsonl(recheck_path), "source_id")
    pending_ids = sorted(source_id for source_id, row in recheck.items() if row["current_verdict"] == "STILL_BAD")
    missing = sorted(set(pending_ids) - set(base))
    if missing:
        raise ValueError(f"STILL_BAD rows absent from V1 converted corpus: {missing[:20]}")
    rows = []
    for source_id in pending_ids:
        current = base[source_id]
        audit = recheck[source_id]
        rows.append({
            "source_id": source_id,
            "status": "PENDING",
            "audit_reason": audit["reason"],
            "intent": current["intent"],
            "asset_catalog": current["asset_catalog"],
            "current_dsl": current["dsl"],
        })
    work_dir.mkdir(parents=True, exist_ok=True)
    pending_path = work_dir / "pending.jsonl"
    if pending_path.exists() or (work_dir / "repairs.jsonl").exists():
        raise FileExistsError(f"refusing to overwrite existing V2 repair workspace: {work_dir}")
    write_jsonl(pending_path, rows)
    write_jsonl(work_dir / "repairs.jsonl", [])
    manifest = {
        "schema_version": "vge-dsl-repair-workset-v2",
        "base_dir": str(base_dir.relative_to(ROOT)),
        "recheck": str(recheck_path.relative_to(ROOT)),
        "base_rows": len(base),
        "pending_rows": len(rows),
        "excluded_recheck_rows": sum(row["current_verdict"] == "EXCLUDED" for row in recheck.values()),
    }
    (work_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_repairs(path: Path) -> dict[str, dict[str, Any]]:
    rows = keyed(read_jsonl(path), "source_id") if path.exists() and path.stat().st_size else {}
    for source_id, row in rows.items():
        unknown = set(row) - {"source_id", "action", "intent", "asset_catalog", "dsl", "reason"}
        if unknown:
            raise ValueError(f"repair {source_id} has unknown fields: {sorted(unknown)}")
        if row.get("action") not in {"FIX", "EXCLUDE"}:
            raise ValueError(f"repair {source_id} action must be FIX or EXCLUDE")
        if not str(row.get("reason", "")).strip():
            raise ValueError(f"repair {source_id} has no reason")
        if row["action"] == "FIX" and not str(row.get("dsl", "")).strip():
            raise ValueError(f"FIX repair {source_id} has no DSL")
    return rows


def split_ids(base_dir: Path, filename: str) -> set[str]:
    return {str(row["source_id"]) for row in read_jsonl(base_dir / filename)}


def build(base_dir: Path, recheck_path: Path, repairs_path: Path, output_dir: Path, extra_repairs_path: Path) -> None:
    base = keyed(read_jsonl(base_dir / "converted.jsonl"), "source_id")
    recheck = keyed(read_jsonl(recheck_path), "source_id")
    required_repairs = load_repairs(repairs_path)
    extra_repairs = load_repairs(extra_repairs_path)
    unknown_extra = sorted(set(extra_repairs) - set(base))
    if unknown_extra:
        raise ValueError(f"extra quality repairs reference unknown source_id values: {unknown_extra[:20]}")
    repairs = {**required_repairs, **extra_repairs}
    required = {source_id for source_id, row in recheck.items() if row["current_verdict"] == "STILL_BAD"}
    if set(required_repairs) != required:
        missing = sorted(required - set(required_repairs))
        extra = sorted(set(required_repairs) - required)
        raise ValueError(f"V2 repair ledger incomplete: missing={len(missing)} {missing[:20]} extra={extra[:20]}")

    train_ids = split_ids(base_dir, "train.jsonl")
    validation_ids = split_ids(base_dir, "validation.jsonl")
    system = editor_system_prompt()
    converted: list[dict[str, Any]] = []
    train: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    actions: Counter[str] = Counter()

    for source_id, current in base.items():
        repair = repairs.get(source_id)
        if repair and repair["action"] == "EXCLUDE":
            excluded.append({"source_id": source_id, "reason": str(repair["reason"])})
            actions["EXCLUDE"] += 1
            continue
        intent = str((repair or {}).get("intent", current["intent"])).strip()
        assets = list((repair or {}).get("asset_catalog", current["asset_catalog"]))
        dsl = str((repair or {}).get("dsl", current["dsl"])).strip()
        compiled = compile_patch(dsl, intent=intent, asset_catalog=assets)
        canonical_dsl = serialize_patch(compiled).rstrip()
        reparsed = parse_program(canonical_dsl)
        if normalize_for_comparison(compiled) != normalize_for_comparison(reparsed):
            raise ValueError(f"round-trip changed command structure for {source_id}")
        errors, warnings, _ = audit_row({
            "source_id": source_id,
            "intent": intent,
            "asset_catalog": assets,
            "dsl": canonical_dsl,
            "output": compiled,
        })
        if errors:
            raise ValueError(f"static audit failed for {source_id}: {errors}")
        converted_row = {
            **current,
            "intent": intent,
            "asset_catalog": assets,
            "dsl": canonical_dsl,
            "output": compiled,
            "v2_repair": repair,
            "v2_warnings": warnings,
        }
        converted.append(converted_row)
        row = {
            "id": f"{source_id}:q1",
            "source_id": source_id,
            "query_variant": 1,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": render_level_dsl_user_prompt(intent, assets)},
                {"role": "assistant", "content": canonical_dsl},
            ],
            "primary_command_type": current.get("primary_command_type"),
            "sample_mode": current.get("sample_mode"),
        }
        (validation if source_id in validation_ids else train).append(row)
        actions["FIX" if repair else "KEEP"] += 1

    output_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_dir / "converted.jsonl", converted)
    write_jsonl(output_dir / "train.jsonl", train)
    write_jsonl(output_dir / "validation.jsonl", validation)
    repair_bytes = repairs_path.read_bytes()
    manifest = {
        "schema_version": "vge-dsl-sft-v2",
        "base_dir": str(base_dir.relative_to(ROOT)),
        "system_prompt_sha256": prompt_sha256(system),
        "repair_ledger_sha256": hashlib.sha256(repair_bytes).hexdigest(),
        "extra_quality_repair_rows": len(extra_repairs),
        "extra_quality_repair_sha256": hashlib.sha256(extra_repairs_path.read_bytes()).hexdigest() if extra_repairs_path.exists() else None,
        "actions": dict(sorted(actions.items())),
        "source_rows": len(base),
        "converted_rows": len(converted),
        "train_rows": len(train),
        "validation_rows": len(validation),
        "excluded": excluded,
        "group_leakage": bool({row["source_id"] for row in train} & {row["source_id"] for row in validation}),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("init", "build"))
    parser.add_argument("--base-dir", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--recheck", type=Path, default=DEFAULT_RECHECK)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--extra-repairs", type=Path, default=DEFAULT_EXTRA_REPAIRS)
    args = parser.parse_args()
    if args.command == "init":
        initialize(args.base_dir, args.recheck, args.work_dir)
    else:
        build(args.base_dir, args.recheck, args.work_dir / "repairs.jsonl", args.output_dir, args.extra_repairs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
