#!/usr/bin/env python3
"""Export first levels from human-authored scenes as compact VGE DSL Markdown."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from training.dsl.level_dsl import parse_program, serialize_patch


DEFAULT_EXCLUDE = {"entry.json", "select-cards-2x2.json"}
UNSUPPORTED_EXPORT_TYPES = {"SCRIPT"}


def _resource_type(bucket: str) -> str:
    return {
        "images": "image",
        "audios": "audio",
        "audio": "audio",
        "animations": "animation",
        "skins": "skin",
    }.get(bucket, bucket.rstrip("s") or "resource")


def _resource_index(scene: dict[str, Any]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    resources = scene.get("resources") or {}
    if not isinstance(resources, dict):
        return result
    for bucket, items in resources.items():
        if not isinstance(items, list):
            continue
        kind = _resource_type(str(bucket))
        for item in items:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            rid = str(item["id"])
            result[rid] = {
                "id": rid,
                "type": kind,
                "path": str(item.get("src") or item.get("path") or ""),
                "name": str(item.get("name") or rid),
            }
    return result


def _used_level_resources(scene: dict[str, Any], level: dict[str, Any], patch: dict[str, Any]) -> list[dict[str, str]]:
    index = _resource_index(scene)
    ids = list(dict.fromkeys(_command_resource_ids(patch)))
    if not ids:
        ids = list(dict.fromkeys(str(rid) for rid in level.get("resources") or [] if rid))
    return [index.get(rid, {"id": rid, "type": "unknown", "path": "", "name": rid}) for rid in ids]


def _command_resource_ids(patch: dict[str, Any]) -> list[str]:
    result: list[str] = []

    def add(value: Any) -> None:
        if isinstance(value, str) and value:
            result.append(value)

    for command in _walk_commands(patch.get("commands") or []):
        params = command.get("parameters") or {}
        for key in (
            "resourceId", "soundId", "musicId", "backResourceId", "frontResourceId",
            "skinId", "overlayResourceId",
        ):
            add(params.get(key))
        ui = params.get("ui") if isinstance(params.get("ui"), dict) else {}
        add(ui.get("buttonSkinId"))
        add(ui.get("selectedSkinId"))
        animation = params.get("animation") if isinstance(params.get("animation"), dict) else {}
        for block in ("entry", "loop"):
            item = animation.get(block) if isinstance(animation.get(block), dict) else {}
            add(item.get("animId"))
    for event in patch.get("extra_events") or []:
        nested = {"commands": event.get("commands") or [], "extra_events": []}
        result.extend(_command_resource_ids(nested))
    return [rid for rid in result if rid not in {"", "__missing_resource__", "__missing_sound__", "__missing_music__"}]


def _walk_commands(commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for command in commands or []:
        if not isinstance(command, dict):
            continue
        result.append(command)
        params = command.get("parameters") or {}
        for field in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"):
            result.extend(_walk_commands(params.get(field) or []))
        for option in params.get("options") or []:
            if isinstance(option, dict):
                result.extend(_walk_commands(option.get("commands") or []))
    return result


def _normalize_legacy_command(command: dict[str, Any]) -> None:
    params = command.setdefault("parameters", {})
    if not isinstance(params, dict):
        command["parameters"] = params = {}

    # Some old scene files stored AREA options outside parameters or omitted the
    # element field entirely. The current DSL needs an elementId, so use the
    # runtime drop element placeholder that these old handlers already mutate.
    if command.get("type") == "CHECK_IN_AREA":
        params.setdefault("elementId", "{last_drop_element_ID}")
        for key in ("outside", "requireEnter"):
            if key in command and key not in params:
                params[key] = command.pop(key)
    if command.get("type") == "SHOW_TEXT":
        params.setdefault("text", "")
        if isinstance(params.get("text"), str):
            params["text"] = _plain_dsl_text(params["text"])
    if command.get("type") == "UPDATE_TEXT":
        params.setdefault("text", "")
        if isinstance(params.get("text"), str):
            params["text"] = _plain_dsl_text(params["text"])
    if command.get("type") == "SHOW_IMAGE":
        params.setdefault("resourceId", "__missing_resource__")
    if command.get("type") == "SE_PLAY":
        params.setdefault("soundId", "__missing_sound__")
    if command.get("type") == "BGM_PLAY":
        params.setdefault("musicId", "__missing_music__")
    if command.get("type") == "SET_VARIABLE" and "value" in params:
        params["value"] = _safe_identifier_value(params["value"])
    if command.get("type") == "IF_CONDITION":
        condition = params.get("condition")
        if isinstance(condition, dict) and "value" in condition:
            condition["value"] = _safe_identifier_value(condition["value"])
    _normalize_dynamic_identifiers(command)

    for child in _walk_commands([command])[1:]:
        _normalize_legacy_command(child)


def _plain_dsl_text(value: str) -> str:
    text = " ".join(value.splitlines())
    text = re.sub(r"<[^>]+>", "", text)
    return text.replace("=", "＝")


def _safe_identifier_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    match = re.fullmatch(r"\{([A-Za-z0-9_.\-\u4e00-\u9fff]+)\}", value)
    if match:
        return "dyn_" + re.sub(r"\W+", "_", match.group(1), flags=re.UNICODE).strip("_")
    return value


def _normalize_dynamic_identifiers(command: dict[str, Any]) -> None:
    params = command.get("parameters") or {}
    for key in ("elementId", "parentId", "resourceId", "backResourceId", "frontResourceId"):
        if key in params:
            params[key] = _safe_identifier_value(params[key])


def _normalized_patch(level: dict[str, Any]) -> dict[str, Any]:
    commands = copy.deepcopy(level.get("commands") or [])
    events = copy.deepcopy(level.get("events") or [])
    for command in commands:
        _normalize_legacy_command(command)
    for event in events:
        for command in event.get("commands") or []:
            _normalize_legacy_command(command)
    return {"commands": commands, "extra_events": events}


def _filter_unsupported(commands: list[dict[str, Any]], removed: list[dict[str, str]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for command in commands or []:
        command_type = str(command.get("type") or "").upper()
        if command_type in UNSUPPORTED_EXPORT_TYPES:
            removed.append({"id": str(command.get("id") or ""), "type": command_type})
            continue
        params = command.get("parameters") or {}
        for field in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"):
            if isinstance(params.get(field), list):
                params[field] = _filter_unsupported(params[field], removed)
        for option in params.get("options") or []:
            if isinstance(option, dict) and isinstance(option.get("commands"), list):
                option["commands"] = _filter_unsupported(option["commands"], removed)
        if command_type == "IF_CONDITION":
            true_commands = params.get("trueCommands") or []
            false_commands = params.get("falseCommands") or []
            if not true_commands and not false_commands:
                removed.append({"id": str(command.get("id") or ""), "type": "EMPTY_IF_CONDITION"})
                continue
            if not true_commands:
                params["trueCommands"] = [{"id": f"{command.get('id', 'if')}_noop", "type": "WAIT", "parameters": {"duration": 0}}]
        result.append(command)
    return result


def _assets_markdown(resources: list[dict[str, str]]) -> str:
    if not resources:
        return "_No level resources listed._"
    lines = ["| id | type | path | name |", "|---|---|---|---|"]
    for item in resources:
        lines.append(
            "| "
            + " | ".join(
                str(item.get(key, "")).replace("|", "\\|")
                for key in ("id", "type", "path", "name")
            )
            + " |"
        )
    return "\n".join(lines)


def export(scene_dir: Path, output: Path, *, limit: int | None = 15) -> dict[str, Any]:
    scene_paths = [
        path for path in sorted(scene_dir.glob("*.json"))
        if path.name not in DEFAULT_EXCLUDE
    ]
    if limit:
        scene_paths = scene_paths[:limit]

    sections: list[str] = [
        "# Human Scene First-Level DSL Export",
        "",
        "Purpose: compact source material for DeepSeek to inspect real human-authored level trajectories without sending full scene JSON.",
        "",
        f"Scene count: {len(scene_paths)}",
        "",
    ]
    manifest: dict[str, Any] = {"scene_count": len(scene_paths), "scenes": [], "errors": []}

    for index, path in enumerate(scene_paths, start=1):
        scene = json.loads(path.read_text(encoding="utf-8"))
        levels = scene.get("levels") or []
        if not levels:
            manifest["errors"].append({"scene": path.name, "error": "no levels"})
            continue
        level = levels[0]
        patch = _normalized_patch(level)
        removed: list[dict[str, str]] = []
        patch["commands"] = _filter_unsupported(patch["commands"], removed)
        for event in patch["extra_events"]:
            event["commands"] = _filter_unsupported(event.get("commands") or [], removed)
        dsl = serialize_patch(patch)
        parse_program(dsl)
        resources = _used_level_resources(scene, level, patch)
        command_count = len(_walk_commands(patch["commands"]))
        event_command_count = sum(len(_walk_commands(event.get("commands") or [])) for event in patch["extra_events"])
        manifest["scenes"].append({
            "scene_file": path.name,
            "scene_name": scene.get("name") or path.stem,
            "level_id": level.get("id"),
            "level_name": level.get("name"),
            "resource_count": len(resources),
            "top_level_commands": len(patch["commands"]),
            "events": len(patch["extra_events"]),
            "nested_main_commands": command_count,
            "nested_event_commands": event_command_count,
            "removed_unsupported_commands": removed,
            "dsl_lines": len(dsl.splitlines()),
        })
        sections.extend([
            f"## {index}. {scene.get('name') or path.stem}",
            "",
            f"- scene_file: `{path.name}`",
            f"- level: `{level.get('name') or level.get('id') or 'level[0]'}`",
            f"- canvas: `{level.get('canvasWidth', 800)} x {level.get('canvasHeight', 600)}`",
            f"- commands/events: `{len(patch['commands'])}` top-level commands, `{len(patch['extra_events'])}` events",
            f"- omitted unsupported old commands: `{len(removed)}`",
            "",
            "### Level Resources",
            "",
            _assets_markdown(resources),
            "",
            "### First-Level DSL",
            "",
            "```vge-dsl",
            dsl.rstrip(),
            "```",
            "",
        ])

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(sections).rstrip() + "\n", encoding="utf-8")
    manifest_path = output.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"output": str(output), "manifest": str(manifest_path), **manifest}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene-dir", type=Path, default=Path("customer-demo/scene"))
    parser.add_argument("--output", type=Path, default=Path("training/eval/human_scene_first_level_dsl.md"))
    parser.add_argument("--limit", type=int, default=15)
    args = parser.parse_args()
    result = export(args.scene_dir, args.output, limit=args.limit)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
