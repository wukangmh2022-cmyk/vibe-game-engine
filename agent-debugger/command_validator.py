"""Executable quality gate for compact instruction-to-command SFT samples."""

from __future__ import annotations

import json
import subprocess
from typing import Any, Iterable
from pathlib import Path

from command_db import CommandDatabase, resource_refs


# These handlers are registered by src/commands/factory.ts and can be exercised
# without a browser or Pixi renderer. Browser-only commands form a later corpus.
DIRECT_RUNTIME_TYPES = {
    "SET_VARIABLE", "WAIT", "MOVE_TO", "SHOW_IMAGE", "SHOW_TEXT", "UPDATE_TEXT",
    "SHOW_CHOICES", "SET_ELEMENT_STYLE", "NEXT_LEVEL", "IF_CONDITION", "JUMP_TO",
    "LOOP", "BREAK", "EMIT_SIGNAL", "BGM_PLAY", "BGM_STOP", "SE_PLAY",
    "SCENE_REDIRECT",
}
ELEMENT_CREATORS = {"SHOW_IMAGE", "SHOW_TEXT"}
ELEMENT_DEPENDENCIES = {"MOVE_TO", "UPDATE_TEXT", "SET_ELEMENT_STYLE"}
RESOURCE_KIND_BY_FIELD = {
    "resourceId": "image", "imageId": "image", "soundId": "audio", "musicId": "audio",
    "skinId": "image", "frontResourceId": "image", "backResourceId": "image",
}
RUNTIME_DRY_RUNNER = Path(__file__).with_name("runtime_dry_run.js")


def walk_commands(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from walk_commands(item)
        return
    if not isinstance(value, dict):
        return
    yield value
    parameters = value.get("parameters")
    if not isinstance(parameters, dict):
        return
    for key in ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands"):
        yield from walk_commands(parameters.get(key))
    options = parameters.get("options")
    if isinstance(options, list):
        for option in options:
            if isinstance(option, dict):
                yield from walk_commands(option.get("commands"))


class CommandSampleValidator:
    def __init__(self, database: CommandDatabase):
        self.allowed_types = {item["command_type"] for item in database.stats()["command_types"]}
        self.project_path = database.project_path()

    def validate(self, sample: Any, primary_type: str, min_commands: int = 1, allowed_existing_assets: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
        errors: list[str] = []
        warnings: list[str] = []
        if not isinstance(sample, dict):
            return {"valid": False, "errors": ["sample must be an object"], "warnings": []}
        intent = sample.get("intent")
        commands = sample.get("commands")
        assets = sample.get("asset_catalog", [])
        if not isinstance(intent, str) or len(intent.strip()) < 8:
            errors.append("intent must be a concrete non-empty Chinese request")
        if not isinstance(commands, list) or not min_commands <= len(commands) <= 4:
            errors.append(f"commands must contain {min_commands}-4 commands")
            commands = []
        if not isinstance(assets, list):
            errors.append("asset_catalog must be an array")
            assets = []
        asset_ids: set[str] = set()
        runtime_assets: list[dict[str, Any]] = []
        for asset in assets:
            if not isinstance(asset, dict) or not isinstance(asset.get("id"), str):
                errors.append("every asset requires an id")
                continue
            asset_ids.add(asset["id"])
            origin = asset.get("origin")
            exists = asset.get("exists")
            if origin != "existing" or exists is not True:
                errors.append(f"executable corpus requires an existing asset: {asset['id']}")
                continue
            expected = (allowed_existing_assets or {}).get(asset["id"])
            if not expected:
                errors.append(f"existing asset {asset['id']} was not exposed by get_level_metadata")
                continue
            if asset.get("type") != expected.get("type"):
                errors.append(f"asset {asset['id']} type must match project metadata ({expected.get('type')})")
            if asset.get("path") != expected.get("path"):
                errors.append(f"asset {asset['id']} path must match project metadata")
            source_path = self.project_path / str(expected.get("path", ""))
            if not source_path.is_file():
                errors.append(f"asset {asset['id']} is missing from the project: {expected.get('path')}")
            runtime_assets.append(asset)
        seen_primary = False
        seen_ids: set[str] = set()
        for command in walk_commands(commands):
            command_id = command.get("id")
            command_type = str(command.get("type", "")).upper()
            if not isinstance(command_id, str) or not command_id.strip():
                errors.append("every command requires a non-empty id")
            elif command_id in seen_ids:
                errors.append(f"duplicate command id: {command_id}")
            else:
                seen_ids.add(command_id)
            if command_type not in self.allowed_types:
                errors.append(f"unsupported command type: {command_type}")
            elif command_type not in DIRECT_RUNTIME_TYPES:
                errors.append(f"{command_type} requires the browser/Pixi corpus and is excluded from executable samples")
            if command_type == primary_type.upper():
                seen_primary = True
            parameters = command.get("parameters")
            if not isinstance(parameters, dict):
                errors.append(f"{command_id or command_type} parameters must be an object")
                continue
            for field_path, resource_id in resource_refs(parameters):
                if resource_id not in asset_ids:
                    errors.append(f"resource id {resource_id} is not declared in asset_catalog")
                else:
                    expected_kind = RESOURCE_KIND_BY_FIELD.get(field_path.rsplit(".", 1)[-1])
                    known_asset = (allowed_existing_assets or {}).get(resource_id)
                    if expected_kind and known_asset and known_asset.get("type") != expected_kind:
                        errors.append(f"resource {resource_id} must be an {expected_kind} for {field_path}")
        if not seen_primary:
            errors.append(f"primary command type {primary_type} is missing")
        if not errors and isinstance(commands, list):
            errors.extend(self._validate_execution_plan(commands))
        runtime = self._run_runtime_dry_run(commands, runtime_assets) if not errors else None
        if runtime and not runtime.get("valid"):
            errors.append(f"runtime dry run failed: {runtime.get('error') or runtime.get('results')}")
        return {"valid": not errors, "errors": errors, "warnings": sorted(set(warnings)), "runtime": runtime}

    def _validate_execution_plan(self, commands: list[dict[str, Any]], known_elements: set[str] | None = None, in_loop: bool = False) -> list[str]:
        """Catch ordering errors before invoking the actual command handlers."""
        errors: list[str] = []
        elements = set(known_elements or set())
        for command in commands:
            command_type = str(command.get("type", "")).upper()
            parameters = command.get("parameters") if isinstance(command.get("parameters"), dict) else {}
            element_id = parameters.get("elementId")
            if command_type in ELEMENT_DEPENDENCIES:
                if not isinstance(element_id, str) or element_id not in elements:
                    errors.append(f"{command.get('id') or command_type} references elementId before it is created")
            if command_type in ELEMENT_CREATORS and isinstance(element_id, str) and element_id:
                elements.add(element_id)
            if command_type == "BREAK" and not in_loop:
                errors.append(f"{command.get('id') or command_type} must be nested inside LOOP.commands")
            if command_type == "LOOP":
                nested = parameters.get("commands")
                if not isinstance(nested, list) or not nested:
                    errors.append(f"{command.get('id') or command_type} requires a non-empty commands array")
                elif all(isinstance(item, dict) for item in nested):
                    errors.extend(self._validate_execution_plan(nested, elements, True))
            for field in ("trueCommands", "falseCommands", "commands", "onSelectedCommands", "onCancelSelectedCommands"):
                nested = parameters.get(field)
                if command_type == "LOOP" and field == "commands":
                    continue
                if isinstance(nested, list) and all(isinstance(item, dict) for item in nested):
                    errors.extend(self._validate_execution_plan(nested, elements, in_loop))
            options = parameters.get("options")
            if isinstance(options, list):
                for option in options:
                    nested = option.get("commands") if isinstance(option, dict) else None
                    if isinstance(nested, list) and all(isinstance(item, dict) for item in nested):
                        errors.extend(self._validate_execution_plan(nested, elements, in_loop))
        return errors

    @staticmethod
    def _run_runtime_dry_run(commands: list[dict[str, Any]], assets: list[dict[str, Any]]) -> dict[str, Any]:
        try:
            result = subprocess.run(
                ["node", "-r", "ts-node/register/transpile-only", str(RUNTIME_DRY_RUNNER)],
                input=json.dumps({"commands": commands, "assets": assets}, ensure_ascii=False),
                text=True,
                capture_output=True,
                timeout=8,
                check=False,
                cwd=RUNTIME_DRY_RUNNER.parent.parent,
            )
            if result.returncode != 0:
                return {"valid": False, "error": result.stderr[-600:] or f"runner exited {result.returncode}"}
            return json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            return {"valid": False, "error": "runtime dry run timed out"}
        except Exception as error:
            return {"valid": False, "error": str(error)}
