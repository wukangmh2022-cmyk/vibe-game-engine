#!/usr/bin/env python3
"""Build grouped, augmented SFT splits whose assistant target is VGE DSL/1."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.dsl.level_dsl import (
    compile_patch,
    normalize_for_comparison,
    parse_program,
    serialize_patch,
    walk_commands,
)
from training.eval.editor_prompt import editor_system_prompt
from training.eval.user_prompt import render_level_dsl_user_prompt
from training.qlora.data_contract import prompt_sha256


SYSTEM = editor_system_prompt()
REVIEW_ROW = re.compile(
    r"^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*(PASS|DSL_FIX|QUERY_FIX|BOTH_FIX|EXCLUDE)\s*\|"
)
FIX_STATUSES = {"DSL_FIX", "QUERY_FIX", "BOTH_FIX"}
CUSTOM_ANIMATION_PATHS = (
    "animations/基础效果/弹入.json",
    "animations/基础效果/淡入.json",
    "animations/基础效果/呼吸.json",
    "animations/基础效果/上下悬浮.json",
    "animations/基础效果/从零放大.json",
    "animations/基础效果/向上滑入.json",
    "animations/基础效果/向下滑入.json",
    "animations/基础效果/向左滑入.json",
    "animations/基础效果/向右滑入.json",
    "animations/基础效果/旋转.json",
    "animations/淡出/淡出.json",
    "animations/淡出/缩小出场.json",
    "animations/淡出/向上滑出.json",
    "animations/淡出/震动退出.json",
    "animations/复合动画/包子下滑入_Q弹.json",
)
CUSTOM_ANIMATIONS_PER_SAMPLE = 3


def verified(record: dict[str, Any]) -> bool:
    runtime = record.get("runtime_validation")
    if isinstance(runtime, dict):
        return runtime.get("valid") is True
    validation = record.get("validation")
    return isinstance(validation, dict) and validation.get("valid") is True and (validation.get("runtime") or {}).get("valid") is True


def compact_assets(assets: list[dict[str, Any]]) -> str:
    if not assets:
        return "(none)"
    rows = []
    for asset in assets:
        rows.append(" | ".join(str(asset.get(key, "")) for key in ("id", "type", "path")))
    return "\n".join(rows)


def render_user(intent: str, assets: list[dict[str, Any]], variant: int) -> str:
    if variant == 0:
        return render_level_dsl_user_prompt(intent, assets)
    catalog = compact_assets(assets)
    if variant == 1:
        return f"请为当前 800x600 关卡实现以下改动：\n{intent}\n\n可用资源（id | type | path）：\n{catalog}"
    return f"需求：{intent}\n画布：800x600\n资源：\n{catalog}\n返回可直接编译的 VGE-DSL/1。"


def fingerprint(record: dict[str, Any]) -> str:
    payload = {"input": record.get("input"), "output": record.get("output")}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def ordered_group(group_id: str, seed: int) -> str:
    return hashlib.sha256(f"{seed}:{group_id}".encode()).hexdigest()


def load_split_ids(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    result = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            result.add(str(json.loads(line).get("id", "")))
    return result


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def load_review(path: Path) -> dict[str, str]:
    decisions: dict[str, str] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        match = REVIEW_ROW.match(line)
        if not match:
            continue
        sample_id, status = match.groups()
        if sample_id in decisions:
            raise ValueError(f"duplicate review decision for {sample_id} at {path}:{line_number}")
        decisions[sample_id] = status
    if not decisions:
        raise ValueError(f"no review decisions found in {path}")
    return decisions


def load_repairs(path: Path) -> dict[str, dict[str, Any]]:
    repairs: dict[str, dict[str, Any]] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        sample_id = str(row.get("sample_id", ""))
        if not sample_id or sample_id in repairs:
            raise ValueError(f"missing or duplicate sample_id at {path}:{line_number}")
        if not str(row.get("reason", "")).strip():
            raise ValueError(f"repair {sample_id} has no manual reason")
        unknown = set(row) - {"sample_id", "intent", "assets", "dsl", "reason"}
        if unknown:
            raise ValueError(f"repair {sample_id} has unknown fields: {sorted(unknown)}")
        repairs[sample_id] = row
    return repairs


def apply_manual_review(
    record: dict[str, Any],
    dsl: str,
    decisions: dict[str, str],
    repairs: dict[str, dict[str, Any]],
) -> tuple[str, list[dict[str, Any]], str] | None:
    sample_id = str(record.get("sample_id", ""))
    if sample_id not in decisions:
        raise ValueError(f"sample {sample_id!r} has no manual review decision")
    status = decisions[sample_id]
    if status == "EXCLUDE":
        return None
    source_input = record.get("input") or {}
    intent = str(source_input.get("intent", ""))
    assets = list(source_input.get("asset_catalog") or [])
    if status == "PASS":
        if sample_id in repairs:
            raise ValueError(f"PASS sample {sample_id} must not have a repair override")
        return intent, assets, dsl

    repair = repairs.get(sample_id)
    if repair is None:
        raise ValueError(f"{status} sample {sample_id} is missing its explicit manual repair")
    needs_query = status in {"QUERY_FIX", "BOTH_FIX"}
    needs_dsl = status in {"DSL_FIX", "BOTH_FIX"}
    if needs_query and "intent" not in repair:
        raise ValueError(f"{status} sample {sample_id} must provide intent")
    if needs_dsl and "dsl" not in repair:
        raise ValueError(f"{status} sample {sample_id} must provide dsl")
    repaired_intent = str(repair.get("intent", intent)).strip()
    repaired_assets = list(repair.get("assets", assets))
    repaired_dsl = str(repair.get("dsl", dsl)).strip()
    if needs_query and repaired_intent == intent.strip():
        raise ValueError(f"repair {sample_id} did not change the query")
    if needs_dsl and repaired_dsl == dsl.strip():
        raise ValueError(f"repair {sample_id} did not change the DSL")
    if not repaired_intent or not repaired_dsl:
        raise ValueError(f"repair {sample_id} produced an empty intent or DSL")
    return repaired_intent, repaired_assets, repaired_dsl


def semantic_resource_catalog(assets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    used: set[str] = set()
    mapping: dict[str, str] = {}
    result: list[dict[str, Any]] = []
    for asset in assets:
        old_id = str(asset.get("id", ""))
        filename = Path(str(asset.get("path", ""))).name
        base = filename.rsplit(".", 1)[0].strip() if "." in filename else filename.strip()
        if not base or not any(char.isalnum() for char in base):
            base = "resource"
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base}_{suffix}"
            suffix += 1
        used.add(candidate)
        mapping[old_id] = candidate
        updated = dict(asset)
        updated["id"] = candidate
        result.append(updated)
    return result, mapping


def augment_custom_animations(assets: list[dict[str, Any]], sample_id: str) -> list[dict[str, Any]]:
    """Expose four real project animations without changing the supervised DSL."""
    result = [dict(asset) for asset in assets]
    existing_paths = {str(asset.get("path", "")) for asset in result}
    animation_count = sum(str(asset.get("type", "")).lower() == "animation" for asset in result)
    needed = max(0, CUSTOM_ANIMATIONS_PER_SAMPLE - animation_count)
    start = int(hashlib.sha256(f"animation:{sample_id}".encode()).hexdigest(), 16) % len(CUSTOM_ANIMATION_PATHS)
    for offset in range(len(CUSTOM_ANIMATION_PATHS)):
        if needed == 0:
            break
        path = CUSTOM_ANIMATION_PATHS[(start + offset) % len(CUSTOM_ANIMATION_PATHS)]
        if path in existing_paths:
            continue
        result.append({
            "id": f"injected_animation_{offset + 1}",
            "type": "animation",
            "path": path,
            "origin": "shared-animation-library",
            "exists": True,
        })
        existing_paths.add(path)
        needed -= 1
    if needed:
        raise ValueError(f"could not provide {CUSTOM_ANIMATIONS_PER_SAMPLE} animations for {sample_id}")
    return result


def remap_dsl_resources(dsl: str, mapping: dict[str, str]) -> str:
    patch = parse_program(dsl)
    resource_paths = {
        "SHOW_IMAGE": ("resourceId",),
        "SHOW_MEDIA": ("resourceId",),
        "FLIP_CARD": ("backResourceId", "frontResourceId"),
        "SET_CLICKABLE": ("frontResourceId", "backResourceId"),
        "SET_SELECTABLE": ("overlayResourceId",),
        "FIREWORK_BURST": ("resourceId",),
        "BGM_PLAY": ("musicId",),
        "SE_PLAY": ("soundId",),
        "SHOW_TEXT": ("skinId",),
    }
    for command in walk_commands(patch["commands"], patch["extra_events"]):
        parameters = command.get("parameters") or {}
        for field in resource_paths.get(str(command.get("type")), ()):
            value = parameters.get(field)
            if isinstance(value, str) and value in mapping:
                parameters[field] = mapping[value]
        animation = parameters.get("animation")
        if isinstance(animation, dict):
            for phase in animation.values():
                if isinstance(phase, dict) and isinstance(phase.get("animId"), str):
                    phase["animId"] = mapping.get(phase["animId"], phase["animId"])
        ui = parameters.get("ui")
        if isinstance(ui, dict):
            for field in ("buttonSkinId", "selectedSkinId"):
                if isinstance(ui.get(field), str):
                    ui[field] = mapping.get(ui[field], ui[field])
    return serialize_patch(patch).rstrip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", nargs="+", required=True)
    parser.add_argument("--output-dir", default="training/qlora/data/level-authoring-dsl-v1")
    parser.add_argument("--validation-ratio", type=float, default=0.1)
    parser.add_argument("--variants-per-sample", type=int, default=1, choices=(1, 2, 3), help="Use 1 for training; 2-3 are ablation-only duplicate views")
    parser.add_argument("--split-dir", default="training/qlora/data/level-authoring-sft-v4")
    parser.add_argument("--review", default="training-data/dsl-manual-review.md")
    parser.add_argument("--repairs", default="training-data/dsl-manual-repairs.jsonl")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if not 0 < args.validation_ratio < 0.5:
        parser.error("validation-ratio must be between 0 and 0.5")

    review_path = Path(args.review)
    repairs_path = Path(args.repairs)
    decisions = load_review(review_path)
    repairs = load_repairs(repairs_path)
    expected_repairs = {sample_id for sample_id, status in decisions.items() if status in FIX_STATUSES}
    if set(repairs) != expected_repairs:
        missing = sorted(expected_repairs - set(repairs))
        extra = sorted(set(repairs) - expected_repairs)
        raise ValueError(f"manual repair ledger mismatch: missing={missing[:20]} extra={extra[:20]}")

    files: list[Path] = []
    for raw in args.input:
        path = Path(raw)
        files.extend(sorted(path.glob("*.jsonl")) if path.is_dir() else [path])
    files = [path for path in files if path.is_file()]
    seen: set[str] = set()
    groups: list[dict[str, Any]] = []
    converted: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    command_counts: Counter[str] = Counter()
    source_json_chars = dsl_chars = 0

    for path in files:
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            sample_id = ""
            try:
                record = json.loads(line)
                sample_id = str(record.get("sample_id", ""))
                if not verified(record):
                    excluded.append({"source": str(path), "line": str(line_number), "reason": "not_runtime_verified"})
                    continue
                digest = fingerprint(record)
                if digest in seen:
                    excluded.append({"source": str(path), "line": str(line_number), "reason": "duplicate"})
                    continue
                seen.add(digest)
                patch = record["output"]
                dsl = serialize_patch(patch)
                sample_id = sample_id or digest[:12]
                reviewed = apply_manual_review(record, dsl, decisions, repairs)
                if reviewed is None:
                    excluded.append({"sample_id": sample_id, "reason": "manual_review_exclude"})
                    continue
                intent, assets, dsl = reviewed
                assets = augment_custom_animations(assets, sample_id)
                assets, resource_mapping = semantic_resource_catalog(assets)
                dsl = remap_dsl_resources(dsl, resource_mapping)
                compiled = compile_patch(dsl, intent=intent, asset_catalog=assets)
                reparsed = parse_program(serialize_patch(compiled))
                if normalize_for_comparison(compiled) != normalize_for_comparison(reparsed):
                    raise ValueError("DSL compile/serialize/reparse changed command structure")
                converted.append({
                    "source_id": sample_id,
                    "intent": intent,
                    "asset_catalog": assets,
                    "dsl": dsl.rstrip(),
                    "output": compiled,
                    "self_contained": "JUMP_ID " not in dsl,
                })
                if "JUMP_ID " in dsl:
                    excluded.append({"sample_id": sample_id, "reason": "external_jump_target"})
                    continue
                rebuilt = compiled
                for command in walk_commands(rebuilt["commands"], rebuilt["extra_events"]):
                    command_counts[str(command.get("type"))] += 1
                source_json_chars += len(json.dumps(patch, ensure_ascii=False, separators=(",", ":")))
                dsl_chars += len(dsl)
                groups.append({
                    "id": sample_id,
                    "intent": intent,
                    "assets": assets,
                    "dsl": dsl.rstrip(),
                    "primary_command_type": record.get("primary_command_type"),
                    "sample_mode": record.get("sample_mode"),
                })
            except (KeyError, TypeError, json.JSONDecodeError, ValueError) as error:
                if sample_id in repairs:
                    raise ValueError(f"manual repair failed for {sample_id}: {error}") from error
                excluded.append({"source": str(path), "line": str(line_number), "reason": f"invalid:{error}"})

    groups.sort(key=lambda row: ordered_group(row["id"], args.seed))
    split_dir = Path(args.split_dir)
    fixed_train_ids = load_split_ids(split_dir / "train.jsonl")
    fixed_validation_ids = load_split_ids(split_dir / "validation.jsonl")
    if fixed_train_ids or fixed_validation_ids:
        validation_ids = fixed_validation_ids
        unknown = {row["id"] for row in groups} - fixed_train_ids - fixed_validation_ids
        validation_ids |= {row["id"] for row in groups if row["id"] in unknown and int(ordered_group(row["id"], args.seed), 16) % 10 == 0}
    else:
        validation_groups = max(1, round(len(groups) * args.validation_ratio))
        validation_ids = {row["id"] for row in groups[:validation_groups]}
    train_rows: list[dict[str, Any]] = []
    validation_rows: list[dict[str, Any]] = []
    for group in groups:
        target = validation_rows if group["id"] in validation_ids else train_rows
        # Production uses the canonical TASK/CANVAS/ASSETS query. Alternative
        # views are included only when explicitly requested for an ablation.
        variants = list(range(args.variants_per_sample))
        for variant in variants:
            target.append({
                "id": f"{group['id']}:q{variant + 1}",
                "source_id": group["id"],
                "query_variant": variant + 1,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": render_user(group["intent"], group["assets"], variant)},
                    {"role": "assistant", "content": group["dsl"]},
                ],
                "primary_command_type": group["primary_command_type"],
                "sample_mode": group["sample_mode"],
            })

    out = Path(args.output_dir)
    write_jsonl(out / "converted.jsonl", converted)
    write_jsonl(out / "train.jsonl", train_rows)
    write_jsonl(out / "validation.jsonl", validation_rows)
    manifest = {
        "schema_version": "vge-dsl-sft-v1",
        "system_prompt_sha256": prompt_sha256(SYSTEM),
        "manual_review_sha256": hashlib.sha256(review_path.read_bytes()).hexdigest(),
        "manual_repairs_sha256": hashlib.sha256(repairs_path.read_bytes()).hexdigest(),
        "manual_review_counts": dict(sorted(Counter(decisions.values()).items())),
        "manual_repairs_applied": len(repairs),
        "custom_animation_policy": {
            "minimum_per_sample": CUSTOM_ANIMATIONS_PER_SAMPLE,
            "pool": list(CUSTOM_ANIMATION_PATHS),
        },
        "sources": [str(path) for path in files],
        "seed": args.seed,
        "variants_per_sample": args.variants_per_sample,
        "source_groups": len(groups),
        "converted_rows": len(converted),
        "self_contained_rows": sum(bool(row["self_contained"]) for row in converted),
        "train_source_groups": len({row["source_id"] for row in train_rows}),
        "validation_source_groups": len({row["source_id"] for row in validation_rows}),
        "train_rows": len(train_rows),
        "validation_rows": len(validation_rows),
        "group_leakage": bool({row["source_id"] for row in train_rows} & {row["source_id"] for row in validation_rows}),
        "source_json_chars": source_json_chars,
        "dsl_chars": dsl_chars,
        "character_reduction": round(1 - dsl_chars / source_json_chars, 6) if source_json_chars else None,
        "command_counts": dict(sorted(command_counts.items())),
        "excluded_count": len(excluded),
        "excluded": excluded,
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(out), **{key: manifest[key] for key in ("source_groups", "train_rows", "validation_rows", "character_reduction", "excluded_count")}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
