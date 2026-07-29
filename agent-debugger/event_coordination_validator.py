#!/usr/bin/env python3
"""Strict static quality gate for complete commands + extra_events samples.

This validator intentionally models the level authoring contract rather than the
compact single-command corpus.  It checks the event graph as one complete level
change: every custom listener has an emitted signal, command IDs are globally
unique, event objects contain only runtime fields, referenced UI elements exist,
and polling loops have an explicit bounded exit condition.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
SCENE_DIR = ROOT / "customer-demo" / "scene"

EVENT_FIELDS = {"id", "name", "triggers", "commands", "conditions"}
SUPPORTED_TYPES = {
    "SET_VARIABLE", "SET_SWITCH", "WAIT", "JUMP_TO", "EMIT_SIGNAL",
    "IF_CONDITION", "LOOP", "BREAK", "CONTINUE", "RETURN", "SCRIPT",
    "SHOW_IMAGE", "SHOW_TEXT", "UPDATE_TEXT", "SHOW_BUTTON", "SHOW_MEDIA",
    "SHOW_CHOICES", "SET_ELEMENT_STYLE", "MOVE_TO", "SCALE_TO", "ROTATE_TO",
    "FLIP_CARD", "SET_CLICKABLE", "SET_SELECTABLE", "SET_DRAGGABLE",
    "CHECK_IN_AREA", "CHANGE_SELECTED_STATE", "ANIMATE_IN", "ANIMATE_LOOP", "ANIMATE_OUT",
    "STOP_ANIMATION", "FIREWORK_BURST", "BGM_PLAY", "BGM_STOP", "BGM_PAUSE",
    "BGM_RESUME", "SE_PLAY", "SE_STOP", "NEXT_LEVEL", "SCENE_REDIRECT",
}
REQUIRED_PARAMETERS = {
    "SET_VARIABLE": ("key", "value"), "WAIT": ("duration",),
    "EMIT_SIGNAL": ("signal",), "SHOW_IMAGE": ("elementId", "resourceId"),
    "SHOW_TEXT": ("elementId", "text"), "UPDATE_TEXT": ("elementId", "text"),
    "SET_CLICKABLE": ("elementId",), "SET_SELECTABLE": ("elementId",),
    "SET_DRAGGABLE": ("elementId",), "SET_ELEMENT_STYLE": ("elementId", "style"),
    "CHANGE_SELECTED_STATE": ("elementId",), "CHECK_IN_AREA": ("area",),
    "FLIP_CARD": ("elementId", "backResourceId"), "ANIMATE_LOOP": ("elementId",), "ANIMATE_IN": ("elementId",),
    "ANIMATE_OUT": ("elementId",), "SE_PLAY": ("soundId",),
    "BGM_PLAY": ("musicId",), "JUMP_TO": ("target",), "SCENE_REDIRECT": ("url",),
}
ELEMENT_CREATORS = {"SHOW_IMAGE", "SHOW_TEXT", "SHOW_BUTTON", "SHOW_MEDIA", "SHOW_CHOICES"}
ELEMENT_REFERENCES = {
    "UPDATE_TEXT", "SET_CLICKABLE", "SET_SELECTABLE", "SET_DRAGGABLE",
    "SET_ELEMENT_STYLE", "MOVE_TO", "SCALE_TO", "ROTATE_TO", "FLIP_CARD",
    "CHANGE_SELECTED_STATE", "ANIMATE_IN", "ANIMATE_LOOP", "ANIMATE_OUT", "STOP_ANIMATION",
}
RESOURCE_FIELDS = {"resourceId", "imageId", "soundId", "musicId", "animId", "skinId", "frontResourceId", "backResourceId"}
RESOURCE_KIND_BY_FIELD = {
    "resourceId": "image", "imageId": "image", "soundId": "audio", "musicId": "audio",
    "animId": "animation", "frontResourceId": "image", "backResourceId": "image",
}
NESTED_FIELDS = ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands")


def walk_commands(commands: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(commands, list):
        return
    for command in commands:
        if not isinstance(command, dict):
            continue
        yield command
        parameters = command.get("parameters")
        if not isinstance(parameters, dict):
            continue
        for field in NESTED_FIELDS:
            yield from walk_commands(parameters.get(field))
        for option in parameters.get("options") or []:
            if isinstance(option, dict):
                yield from walk_commands(option.get("commands"))


def command_resource_refs(value: Any, path: str = "") -> Iterable[tuple[str, str]]:
    if isinstance(value, list):
        for index, item in enumerate(value):
            yield from command_resource_refs(item, f"{path}[{index}]")
        return
    if not isinstance(value, dict):
        return
    for key, item in value.items():
        child_path = f"{path}.{key}" if path else key
        if key in RESOURCE_FIELDS and isinstance(item, str) and item:
            yield child_path, item
        yield from command_resource_refs(item, child_path)


def _value_is_missing(value: Any) -> bool:
    return value is None or value == "" or value == []


def _loop_is_bounded(command: dict[str, Any]) -> bool:
    parameters = command.get("parameters") or {}
    condition = parameters.get("condition")
    nested = parameters.get("commands") or []
    if not isinstance(condition, dict) or not nested:
        return False
    if condition.get("type") == "variable" and isinstance(condition.get("key"), str):
        key = condition["key"]
        return any(
            item.get("type") == "SET_VARIABLE"
            and (item.get("parameters") or {}).get("key") == key
            and (item.get("parameters") or {}).get("op") in {"add", "sub", "mul", "div", "set"}
            for item in walk_commands(nested)
        )
    return condition.get("type") == "expression" and isinstance(condition.get("expression"), str) and bool(condition["expression"].strip())


def referenced_variables(command: dict[str, Any]) -> set[str]:
    """Return variable reads in conditions and runtime {name} interpolation."""
    result: set[str] = set()
    parameters = command.get("parameters") if isinstance(command.get("parameters"), dict) else {}
    condition = parameters.get("condition")
    if isinstance(condition, dict) and condition.get("type") in {"variable", "switch"} and isinstance(condition.get("key"), str):
        result.add(condition["key"])
    for value in parameters.values():
        if isinstance(value, str):
            result.update(re.findall(r"(?<!\$)\{([^}]+)\}", value))
    return result


def has_unsupported_dollar_interpolation(value: Any) -> bool:
    if isinstance(value, str):
        return "${" in value
    if isinstance(value, list):
        return any(has_unsupported_dollar_interpolation(item) for item in value)
    if isinstance(value, dict):
        return any(has_unsupported_dollar_interpolation(item) for item in value.values())
    return False


VALIDATION_MODES = {"complete_patch", "level_context"}


class EventCoordinationValidator:
    def validate(self, sample: dict[str, Any], *, mode: str = "complete_patch") -> dict[str, Any]:
        """Validate either a self-contained patch or a command delta for an existing level.

        ``complete_patch`` is for the event-coordination corpus: every signal,
        element, and listener required by the output must appear in the output.
        ``level_context`` is for the existing command corpus: a command may
        intentionally target an element/event which the current level already
        owns, so unresolved external dependencies are reported as warnings.
        """
        errors: list[str] = []
        warnings: list[str] = []
        if mode not in VALIDATION_MODES:
            return {"valid": False, "errors": [f"unknown validation mode: {mode}"], "warnings": []}
        require_complete = mode == "complete_patch"
        if not isinstance(sample, dict):
            return {"valid": False, "errors": ["sample must be an object"], "warnings": []}
        output = sample.get("output", sample)
        if not isinstance(output, dict):
            return {"valid": False, "errors": ["output must be an object"], "warnings": []}
        commands = output.get("commands")
        extra_events = output.get("extra_events", [])
        if not isinstance(commands, list):
            errors.append("output.commands must be an array")
            commands = []
        if not isinstance(extra_events, list):
            errors.append("output.extra_events must be an array")
            extra_events = []
        if require_complete and not commands:
            errors.append("complete cross-event output requires non-empty commands")
        if require_complete and not extra_events:
            errors.append("cross-event output requires non-empty extra_events")

        declared_assets = self._declared_assets(sample)
        for asset_id, asset in declared_assets.items():
            path = asset.get("path")
            if asset.get("origin") == "existing" and asset.get("exists") is not True:
                message = f"asset {asset_id} is marked existing but exists is not true"
                (errors if require_complete else warnings).append(message)
            if isinstance(path, str) and path and not path.startswith("virtual://"):
                on_disk = ROOT / "customer-demo" / path
                if not on_disk.is_file():
                    message = f"asset {asset_id} path is missing from customer-demo: {path}"
                    (errors if require_complete else warnings).append(message)
        event_ids: set[str] = set()
        triggers: list[tuple[str, str]] = []
        all_command_groups: list[tuple[str, list[dict[str, Any]]]] = [("commands", commands)]
        for index, event in enumerate(extra_events):
            location = f"extra_events[{index}]"
            if not isinstance(event, dict):
                errors.append(f"{location} must be an object")
                continue
            unknown = sorted(set(event) - EVENT_FIELDS)
            if unknown:
                errors.append(f"{location} has unsupported EventConfig fields: {', '.join(unknown)}")
            event_id = event.get("id")
            if not isinstance(event_id, str) or not event_id.strip():
                errors.append(f"{location}.id must be a non-empty string")
            elif event_id in event_ids:
                errors.append(f"duplicate event id: {event_id}")
            else:
                event_ids.add(event_id)
            if not isinstance(event.get("name"), str) or not event["name"].strip():
                errors.append(f"{location}.name must be a non-empty string")
            event_triggers = event.get("triggers")
            event_commands = event.get("commands")
            if not isinstance(event_triggers, list) or not event_triggers:
                errors.append(f"{location}.triggers must be a non-empty array")
                event_triggers = []
            if not isinstance(event_commands, list) or not event_commands:
                errors.append(f"{location}.commands must be a non-empty array")
                event_commands = []
            for trigger_index, trigger in enumerate(event_triggers):
                trigger_location = f"{location}.triggers[{trigger_index}]"
                if not isinstance(trigger, dict):
                    errors.append(f"{trigger_location} must be an object")
                    continue
                trigger_type = trigger.get("type")
                if trigger_type == "custom":
                    target = trigger.get("target")
                    if not isinstance(target, str) or not target.strip():
                        errors.append(f"{trigger_location}.target must be a non-empty signal")
                    else:
                        triggers.append((str(event_id), target))
                elif trigger_type == "auto":
                    if trigger.get("start") != "immediate":
                        errors.append(f"{trigger_location} only supports auto start=immediate")
                else:
                    errors.append(f"{trigger_location} has unsupported trigger type: {trigger_type}")
            all_command_groups.append((location, event_commands))

        all_commands = [command for _, group in all_command_groups for command in walk_commands(group)]
        command_ids: set[str] = set()
        emitted_signals: set[str] = set()
        created_elements: set[str] = set()
        defined_variables: set[str] = set()
        for command in all_commands:
            command_id = command.get("id")
            command_type = str(command.get("type", "")).upper()
            if not isinstance(command_id, str) or not command_id.strip():
                errors.append("every command requires a non-empty id")
            elif command_id in command_ids:
                errors.append(f"duplicate command id: {command_id}")
            else:
                command_ids.add(command_id)
            if command_type not in SUPPORTED_TYPES:
                errors.append(f"unsupported command type: {command_type}")
                continue
            parameters = command.get("parameters")
            if not isinstance(parameters, dict):
                errors.append(f"{command_id or command_type}.parameters must be an object")
                continue
            if has_unsupported_dollar_interpolation(parameters):
                message = f"{command_id or command_type} uses unsupported ${{...}} interpolation; runtime requires {{variableKey}}"
                (errors if require_complete else warnings).append(message)
            for required in REQUIRED_PARAMETERS.get(command_type, ()):
                if _value_is_missing(parameters.get(required)):
                    errors.append(f"{command_id or command_type} missing required parameter: {required}")
            if command_type == "EMIT_SIGNAL" and isinstance(parameters.get("signal"), str) and parameters["signal"].strip():
                emitted_signals.add(parameters["signal"])
            if command_type in {"SET_VARIABLE", "SET_SWITCH"} and isinstance(parameters.get("key"), str) and parameters["key"].strip():
                defined_variables.add(parameters["key"])
            if command_type in ELEMENT_CREATORS and isinstance(parameters.get("elementId"), str) and parameters["elementId"]:
                created_elements.add(parameters["elementId"])
            if command_type == "IF_CONDITION":
                condition = parameters.get("condition")
                if not isinstance(condition, dict) or condition.get("type") not in {"variable", "expression", "switch"}:
                    errors.append(f"{command_id or command_type} has invalid condition")
                for branch in ("trueCommands", "falseCommands"):
                    if not isinstance(parameters.get(branch), list):
                        errors.append(f"{command_id or command_type} requires {branch} array")
            if command_type == "LOOP" and not _loop_is_bounded(command):
                message = f"{command_id or command_type} must use a bounded condition and update its condition state"
                (errors if require_complete else warnings).append(message)

        for command in all_commands:
            command_type = str(command.get("type", "")).upper()
            parameters = command.get("parameters") if isinstance(command.get("parameters"), dict) else {}
            element_id = parameters.get("elementId")
            if command_type in ELEMENT_REFERENCES and isinstance(element_id, str) and element_id not in created_elements:
                message = f"{command.get('id') or command_type} references elementId that is not created in this output: {element_id}"
                (errors if require_complete else warnings).append(message)
            parent_id = parameters.get("parentId")
            if isinstance(parent_id, str) and parent_id and parent_id not in created_elements:
                message = f"{command.get('id') or command_type} references parentId that is not created in this output: {parent_id}"
                (errors if require_complete else warnings).append(message)
            for variable in referenced_variables(command):
                if variable not in defined_variables:
                    message = f"{command.get('id') or command_type} reads variable that is not initialized in this output: {variable}"
                    (errors if require_complete else warnings).append(message)
        for field_path, resource_id in command_resource_refs({"commands": commands, "extra_events": extra_events}):
            asset = declared_assets.get(resource_id)
            if not asset:
                message = f"resource {resource_id} at {field_path} is absent from input.asset_catalog"
                (errors if require_complete else warnings).append(message)
                continue
            field = field_path.rsplit(".", 1)[-1]
            expected_kind = RESOURCE_KIND_BY_FIELD.get(field)
            if expected_kind and asset.get("type") != expected_kind:
                errors.append(f"resource {resource_id} at {field_path} must have type {expected_kind}, got {asset.get('type')}")

        listener_signals = {target for _, target in triggers}
        for event_id, target in triggers:
            if target not in emitted_signals:
                message = f"event {event_id} listens for signal {target} but this output never emits it"
                (errors if require_complete else warnings).append(message)
        for signal in emitted_signals:
            if signal not in listener_signals:
                message = f"signal {signal} has no custom-event listener in this output"
                (errors if require_complete else warnings).append(message)
        return {
            "valid": not errors,
            "errors": sorted(set(errors)),
            "warnings": sorted(set(warnings)),
            "summary": {
                "commands": len(all_commands), "extra_events": len(extra_events),
                "signals": len(emitted_signals), "custom_listeners": len(triggers),
            },
        }

    @staticmethod
    def _declared_assets(sample: dict[str, Any]) -> dict[str, dict[str, Any]]:
        input_data = sample.get("input") if isinstance(sample.get("input"), dict) else sample
        assets = input_data.get("asset_catalog") if isinstance(input_data, dict) else None
        if not isinstance(assets, list):
            return {}
        return {item["id"]: item for item in assets if isinstance(item, dict) and isinstance(item.get("id"), str)}


def _scene_sample(scene: dict[str, Any], level: dict[str, Any]) -> dict[str, Any]:
    return {"output": {"commands": level.get("commands") or [], "extra_events": level.get("events") or []}}


def validate_document(document: dict[str, Any], mode: str = "complete_patch") -> dict[str, Any]:
    validator = EventCoordinationValidator()
    examples = document.get("examples") or document.get("samples") or []
    results = []
    for index, example in enumerate(examples):
        result = validator.validate(example, mode=mode)
        results.append({"id": example.get("example_id", example.get("sample_id", str(index))), **result})
    return {"total": len(results), "valid": sum(item["valid"] for item in results), "invalid": sum(not item["valid"] for item in results), "results": results}


def validate_scenes(scene_names: list[str]) -> dict[str, Any]:
    validator = EventCoordinationValidator()
    results = []
    for name in scene_names:
        scene_path = SCENE_DIR / f"{name}.json"
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        level = (scene.get("levels") or [None])[0]
        if not isinstance(level, dict):
            continue
        result = validator.validate(_scene_sample(scene, level), mode="level_context")
        results.append({"scene": name, "level_id": level.get("id"), **result})
    error_counts = Counter(error for item in results for error in item["errors"])
    return {"total": len(results), "valid": sum(item["valid"] for item in results), "invalid": sum(not item["valid"] for item in results), "top_errors": error_counts.most_common(20), "results": results}


def validate_jsonl(path: Path, mode: str) -> dict[str, Any]:
    """Audit an existing SFT corpus without mutating it."""
    validator = EventCoordinationValidator()
    results = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            sample = json.loads(line)
        except json.JSONDecodeError as error:
            results.append({"line": line_number, "valid": False, "errors": [f"invalid JSON: {error.msg}"], "warnings": []})
            continue
        result = validator.validate(sample, mode=mode)
        results.append({"line": line_number, "id": sample.get("sample_id", str(line_number)), **result})
    error_counts = Counter(error for item in results for error in item["errors"])
    warning_counts = Counter(warning for item in results for warning in item["warnings"])
    return {
        "source": str(path), "mode": mode, "total": len(results),
        "valid": sum(item["valid"] for item in results), "invalid": sum(not item["valid"] for item in results),
        "top_errors": error_counts.most_common(20), "top_warnings": warning_counts.most_common(20), "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate complete level event-coordination samples")
    parser.add_argument("--input", type=Path, help="event SFT/curriculum JSON document")
    parser.add_argument("--jsonl", type=Path, help="audit an SFT JSONL corpus without changing it")
    parser.add_argument("--scenes", nargs="*", metavar="SCENE", help="validate first levels from scene files")
    parser.add_argument("--report", type=Path, help="write JSON report")
    parser.add_argument("--mode", choices=sorted(VALIDATION_MODES), default="complete_patch")
    args = parser.parse_args()
    selected = sum(value is not None for value in (args.input, args.jsonl, args.scenes))
    if selected != 1:
        parser.error("provide exactly one of --input, --jsonl, or --scenes")
    if args.input:
        report = validate_document(json.loads(args.input.read_text(encoding="utf-8")), mode=args.mode)
    elif args.jsonl:
        report = validate_jsonl(args.jsonl, args.mode)
    else:
        scene_names = args.scenes or [path.stem for path in sorted(SCENE_DIR.glob("*.json"))]
        report = validate_scenes(scene_names)
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if report["invalid"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
