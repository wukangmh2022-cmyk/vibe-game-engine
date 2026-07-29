#!/usr/bin/env python3
"""Block training unless the generated DSL corpus passes structural and JS runtime gates."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_debugger_import import load_runtime_validator
from training.dsl.level_dsl import normalize_for_comparison, parse_program, serialize_patch, walk_commands
from training.qlora.data_contract import validate_dsl_dataset


RESOURCE_FIELDS: dict[str, dict[str, str]] = {
    "SHOW_IMAGE": {"resourceId": "image"},
    "SHOW_MEDIA": {"resourceId": "media"},
    "FLIP_CARD": {"frontResourceId": "image", "backResourceId": "image"},
    "SET_CLICKABLE": {"frontResourceId": "image", "backResourceId": "image"},
    "SET_SELECTABLE": {"overlayResourceId": "image"},
    "FIREWORK_BURST": {"resourceId": "image"},
    "BGM_PLAY": {"musicId": "audio"},
    "SE_PLAY": {"soundId": "audio"},
    "SHOW_TEXT": {"skinId": "image"},
}
ELEMENT_CREATION_TYPES = {"SHOW_IMAGE", "SHOW_TEXT", "SHOW_BUTTON", "SHOW_MEDIA", "SHOW_CHOICES"}
ELEMENT_REFERENCE_FIELDS = {
    "UPDATE_TEXT": "elementId", "SET_ELEMENT_STYLE": "elementId", "MOVE_TO": "elementId",
    "SCALE_TO": "elementId", "ROTATE_TO": "elementId", "FLIP_CARD": "elementId",
    "SET_CLICKABLE": "elementId", "SET_SELECTABLE": "elementId", "SET_DRAGGABLE": "elementId",
    "CHECK_IN_AREA": "elementId", "CHANGE_SELECTED_STATE": "elementId", "ANIMATE_IN": "elementId",
    "ANIMATE_LOOP": "elementId", "ANIMATE_OUT": "elementId", "STOP_ANIMATION": "elementId",
}
FORBIDDEN_DSL = {
    "JUMP_ID ": "external JUMP_ID target",
    "SCENE this": "non-URL current-scene redirect",
    'animId:""': "empty animation resource",
    'animId=""': "empty animation resource",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def nested_commands(commands: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for command in commands:
        yield command
        params = command.get("parameters") or {}
        for field in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"):
            yield from nested_commands(params.get(field) or [])
        for option in params.get("options") or []:
            if isinstance(option, dict):
                yield from nested_commands(option.get("commands") or [])


def compatible_type(actual: str, expected: str) -> bool:
    actual = actual.lower()
    if expected == "media":
        return actual in {"image", "video", "audio", "media"}
    return actual == expected


def command_resources(command: dict[str, Any]) -> Iterable[tuple[str, str, str]]:
    command_type = str(command.get("type", ""))
    params = command.get("parameters") or {}
    for field, expected in RESOURCE_FIELDS.get(command_type, {}).items():
        value = params.get(field)
        if value is not None:
            yield field, str(value), expected
    animation = params.get("animation")
    if isinstance(animation, dict):
        for phase_name, phase in animation.items():
            if isinstance(phase, dict) and "animId" in phase:
                yield f"animation.{phase_name}.animId", str(phase.get("animId", "")), "animation"
    ui = params.get("ui")
    if isinstance(ui, dict):
        for field in ("buttonSkinId", "selectedSkinId"):
            if field in ui:
                yield f"ui.{field}", str(ui.get(field, "")), "image"


def has_loop_exit(command: dict[str, Any]) -> bool:
    params = command.get("parameters") or {}
    body = list(nested_commands(params.get("commands") or []))
    if any(child.get("type") in {"BREAK", "RETURN", "NEXT_LEVEL", "SCENE_REDIRECT"} for child in body):
        return True
    condition = params.get("condition") or {}
    key = condition.get("key") if isinstance(condition, dict) else None
    return bool(key) and any(
        child.get("type") == "SET_VARIABLE" and (child.get("parameters") or {}).get("key") == key
        for child in body
    )


def audit_row(row: dict[str, Any]) -> tuple[list[str], list[str], dict[str, Any]]:
    source_id = str(row.get("source_id", ""))
    errors: list[str] = []
    warnings: list[str] = []
    dsl = str(row.get("dsl", ""))
    output = row.get("output") or {}
    assets = row.get("asset_catalog") or []
    if not source_id or not dsl or not isinstance(output, dict):
        return ["missing source_id, dsl, or compiled output"], warnings, {}
    for fragment, description in FORBIDDEN_DSL.items():
        if fragment in dsl:
            errors.append(description)
    if re.search(r'fontSize(?:=|":)"?\d+px', dsl):
        errors.append("fontSize contains px residue")
    if re.search(r'(?m)^( *)TEXT ([^\s]+)[^\n]*\n\1TEXT_SET \2(?:\s|$)', dsl):
        errors.append("TEXT is immediately overwritten by TEXT_SET in the same command scope")
    parsed = parse_program(dsl)
    reparsed = parse_program(serialize_patch(parsed))
    if normalize_for_comparison(parsed) != normalize_for_comparison(reparsed):
        errors.append("parse/serialize/reparse structural mismatch")
    if normalize_for_comparison(output) != normalize_for_comparison(parsed):
        errors.append("stored compiled output differs from DSL")
    catalog: dict[str, str] = {}
    catalog_paths: dict[str, str] = {}
    for asset in assets:
        asset_id = str(asset.get("id", "")).strip()
        asset_type = str(asset.get("type", "")).strip()
        if not asset_id or not asset_type:
            errors.append("asset has empty id or type")
            continue
        if asset_id in catalog:
            errors.append(f"duplicate asset id: {asset_id}")
        if not any(char.isalnum() for char in asset_id):
            errors.append(f"non-semantic asset id: {asset_id!r}")
        catalog[asset_id] = asset_type
        catalog_paths[asset_id] = str(asset.get("path", "")).strip()
    created: set[str] = set()
    emitted: set[str] = set()
    listened: set[str] = set()
    events = parsed.get("extra_events") or []
    for event in events:
        for trigger in event.get("triggers") or []:
            if trigger.get("type") == "custom" and trigger.get("target"):
                listened.add(str(trigger["target"]))
    commands = list(walk_commands(parsed.get("commands") or [], events))
    command_types = {str(command.get("type", "")) for command in commands}
    intent = str(row.get("intent", ""))
    if re.search(r"(?:跳|弹)一下", intent) and not command_types.intersection(
        {"ANIMATE_IN", "ANIMATE_LOOP", "SCALE_TO", "MOVE_TO"}
    ):
        errors.append("query requests a one-shot jump/bounce but DSL has no visible animation")
    if re.search(r"一直重复(?:展示|轮播|切换)", intent):
        has_resource_loop = any(
            isinstance((command.get("parameters") or {}).get("animation"), dict)
            and bool(((command.get("parameters") or {}).get("animation") or {}).get("loop"))
            for command in commands
        )
        if not command_types.intersection({"LOOP", "ANIMATE_LOOP"}) and not has_resource_loop:
            errors.append("query requests repeated display/rotation but DSL has no loop")
    for command in commands:
        command_type = str(command.get("type", ""))
        params = command.get("parameters") or {}
        if command_type == "SET_ELEMENT_STYLE":
            style = params.get("style") or {}
            if isinstance(style, dict):
                for key, value in style.items():
                    if "-" in str(key):
                        errors.append(f"SET_ELEMENT_STYLE uses CSS-style key {key!r}; use camelCase runtime fields")
        if command_type in ELEMENT_CREATION_TYPES and params.get("elementId"):
            created.add(str(params["elementId"]))
        if command_type == "EMIT_SIGNAL" and params.get("signal"):
            emitted.add(str(params["signal"]))
        for field, resource_id, expected_type in command_resources(command):
            if not resource_id:
                errors.append(f"{command_type}.{field} is empty")
            elif resource_id not in catalog:
                errors.append(f"{command_type}.{field} references absent asset {resource_id!r}")
            elif not compatible_type(catalog[resource_id], expected_type):
                errors.append(
                    f"{command_type}.{field} expects {expected_type}, got {catalog[resource_id]} for {resource_id!r}"
                )
            elif command_type in {"BGM_PLAY", "SE_PLAY"}:
                normalized_path = f"/{catalog_paths.get(resource_id, '').replace(chr(92), '/').lower().strip('/')}"
                expected_directory = "/bgm/" if command_type == "BGM_PLAY" else "/se/"
                if expected_directory not in normalized_path:
                    errors.append(
                        f"{command_type}.{field} references {resource_id!r} outside {expected_directory.strip('/')} directory"
                    )
        if command_type == "LOOP" and not has_loop_exit(command):
            warnings.append(f"loop {command.get('id')} has no obvious condition update or exit")
    for command in commands:
        field = ELEMENT_REFERENCE_FIELDS.get(str(command.get("type", "")))
        element_id = str((command.get("parameters") or {}).get(field, "")) if field else ""
        if element_id and element_id not in created:
            warnings.append(f"element {element_id!r} is referenced without creation in this standalone sample")
    for signal in sorted(listened - emitted):
        warnings.append(f"event listens for external signal {signal!r}")
    for signal in sorted(emitted - listened):
        warnings.append(f"signal {signal!r} has no local ON handler")
    return errors, warnings, parsed


def runtime_record(row: dict[str, Any], runtime_validator: Any) -> dict[str, Any]:
    assets = []
    for asset in row.get("asset_catalog") or []:
        updated = dict(asset)
        kind = str(updated.get("type") or "image")
        updated["url"] = runtime_validator.placeholder(str(updated.get("id", "")), kind)["url"]
        assets.append(updated)
    commands = list(walk_commands((row.get("output") or {}).get("commands") or [], (row.get("output") or {}).get("extra_events") or []))
    needs_existing_bgm = any(command.get("type") in {"BGM_PAUSE", "BGM_STOP"} for command in commands)
    runtime_initial_state = {"current_bgm": "runtime-existing-bgm", "bgm_playing": True} if needs_existing_bgm else {}
    return {
        "sample_id": row["source_id"],
        "source_dataset": "level-authoring-dsl-v1",
        "input": {"asset_catalog": assets, "runtime_initial_state": runtime_initial_state},
        "output": row["output"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=ROOT / "training/qlora/data/level-authoring-dsl-v1")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--runtime-start", type=int, default=0)
    parser.add_argument("--runtime-limit", type=int, default=0)
    parser.add_argument("--skip-runtime", action="store_true")
    args = parser.parse_args()
    report_path = args.report or args.data_dir / "quality-report.json"
    validate_dsl_dataset(args.data_dir, require_quality_reports=False)
    converted = read_jsonl(args.data_dir / "converted.jsonl")
    train = read_jsonl(args.data_dir / "train.jsonl")
    validation = read_jsonl(args.data_dir / "validation.jsonl")
    ids = [str(row.get("source_id", "")) for row in converted]
    errors_by_id: dict[str, list[str]] = {}
    warnings_by_id: dict[str, list[str]] = {}
    if len(ids) != len(set(ids)):
        errors_by_id["__dataset__"] = ["converted.jsonl contains duplicate source_id values"]
    split_ids = [str(row.get("source_id", "")) for row in train + validation]
    if Counter(split_ids) != Counter(ids):
        errors_by_id.setdefault("__dataset__", []).append("train/validation source IDs do not exactly cover converted rows")
    if set(row.get("source_id") for row in train) & set(row.get("source_id") for row in validation):
        errors_by_id.setdefault("__dataset__", []).append("train/validation source leakage")
    for row in converted:
        row_errors, row_warnings, _ = audit_row(row)
        if row_errors:
            errors_by_id[row["source_id"]] = row_errors
        if row_warnings:
            warnings_by_id[row["source_id"]] = row_warnings
    static_valid = not errors_by_id
    runtime_results: list[dict[str, Any]] = []
    if not args.skip_runtime and not errors_by_id:
        runtime_validator = load_runtime_validator(ROOT / "agent-debugger/validate_unified_runtime.py")
        runtime_rows = converted[args.runtime_start:]
        if args.runtime_limit:
            runtime_rows = runtime_rows[:args.runtime_limit]
        records = [runtime_record(row, runtime_validator) for row in runtime_rows]
        print(json.dumps({"runtime_start": args.runtime_start, "runtime_rows": len(records)}, ensure_ascii=False), flush=True)
        runtime_results = runtime_validator.run_all(records, args.timeout, args.batch_size)
        for result in runtime_results:
            if not result.get("valid"):
                messages = [str(error.get("error", error)) for error in (result.get("runtime") or {}).get("errors", [])]
                errors_by_id.setdefault(str(result.get("sample_id")), []).extend(messages or ["JS runtime failed"])
    report = {
        "schema_version": "vge-dsl-quality-report-v1",
        "converted_rows": len(converted),
        "train_rows": len(train),
        "validation_rows": len(validation),
        "static_valid": static_valid,
        "runtime_executed": not args.skip_runtime and bool(runtime_results),
        "runtime_valid": bool(runtime_results) and all(result.get("valid") for result in runtime_results),
        "warning_rows": len(warnings_by_id),
        "errors": errors_by_id,
        "warnings": warnings_by_id,
        "runtime_results": [
            {"source_id": result.get("sample_id"), "valid": result.get("valid"), "errors": (result.get("runtime") or {}).get("errors", [])}
            for result in runtime_results
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "converted": len(converted), "train": len(train), "validation": len(validation),
        "error_rows": len(errors_by_id), "warning_rows": len(warnings_by_id),
        "runtime_valid": report["runtime_valid"], "report": str(report_path),
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if not errors_by_id and (args.skip_runtime or report["runtime_valid"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
