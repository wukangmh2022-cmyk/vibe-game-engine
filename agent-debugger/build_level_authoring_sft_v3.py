#!/usr/bin/env python3
"""Assemble the V3 training candidate without changing earlier corpus versions."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT


ROOT = REPO_ROOT
PREVIOUS_PASSED = ROOT / "training-data" / "level-authoring-sft-v1-runtime-passed.jsonl"
PHASE2_V3 = ROOT / "training-data" / "event-coordination-sft-v3.json"
OUTPUT = ROOT / "training-data" / "level-authoring-sft-v3.jsonl"
MANIFEST = ROOT / "training-data" / "level-authoring-sft-v3-manifest.json"


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def normalize_runtime_interpolation(value: Any) -> tuple[Any, int]:
    """Repair legacy ${name} strings only in the derived V3 training view."""
    if isinstance(value, str):
        normalized, replacements = re.subn(r"\$\{([^}]+)\}", r"{\1}", value)
        return normalized, replacements
    if isinstance(value, list):
        changes = 0
        normalized = []
        for item in value:
            repaired, count = normalize_runtime_interpolation(item)
            normalized.append(repaired)
            changes += count
        return normalized, changes
    if isinstance(value, dict):
        changes = 0
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            repaired, count = normalize_runtime_interpolation(item)
            normalized[key] = repaired
            changes += count
        return normalized, changes
    return value, 0


def main() -> int:
    previous = load_jsonl(PREVIOUS_PASSED)
    retained = [deepcopy(record) for record in previous if record.get("source_dataset") != "event-coordination-sft-v2"]
    if len(retained) != 1234:
        raise RuntimeError(f"expected 1234 retained phase 1/3 records, found {len(retained)}")
    interpolation_repairs = 0
    repaired_records = 0
    for record in retained:
        input_data, input_replacements = normalize_runtime_interpolation(record.get("input") or {})
        output, output_replacements = normalize_runtime_interpolation(record.get("output") or {})
        replacements = input_replacements + output_replacements
        record["input"] = input_data
        record["output"] = output
        if replacements:
            interpolation_repairs += replacements
            repaired_records += 1
            validation = record.setdefault("training_validation", {})
            validation["runtime_interpolation_repairs"] = replacements
    document = json.loads(PHASE2_V3.read_text(encoding="utf-8"))
    phase2: list[dict[str, Any]] = []
    for item in document.get("examples") or []:
        phase2.append({
            "schema_version": "vibe-level-authoring-sft-v1",
            "dataset_version": "level-authoring-sft-v3",
            "sample_id": f"phase2-{item['example_id']}",
            "source_dataset": "event-coordination-sft-v3",
            "source_record_id": item["example_id"],
            "input": item["input"],
            "output": item["output"],
            "runtime_evaluation": item["runtime_evaluation"],
            "training_validation": {"phase": "phase2", "source_static_valid": True, "behavioral_runtime_required": True},
        })
    if len(phase2) != 300:
        raise RuntimeError(f"expected 300 V3 phase 2 records, found {len(phase2)}")
    records = retained + phase2
    OUTPUT.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    manifest = {
        "schema_version": "level-authoring-sft-v3-candidate-manifest",
        "candidate": str(OUTPUT.relative_to(ROOT)),
        "total_records": len(records),
        "retained_phase1_and_phase3_records": len(retained),
        "replaced_phase2_records": len(phase2),
        "legacy_runtime_interpolation_repairs": {"records": repaired_records, "occurrences": interpolation_repairs},
        "sources": [str(PREVIOUS_PASSED.relative_to(ROOT)), str(PHASE2_V3.relative_to(ROOT))],
        "old_versions_preserved": True,
        "acceptance": "Run validate_unified_runtime.py; only its passed view may be formatted for training.",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
