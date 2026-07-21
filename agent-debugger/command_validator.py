"""Static validator for compact instruction-to-command SFT samples."""

from __future__ import annotations

from typing import Any, Iterable

from command_db import CommandDatabase, resource_refs


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

    def validate(self, sample: Any, primary_type: str, min_commands: int = 1, allowed_existing_assets: set[str] | None = None) -> dict[str, Any]:
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
        for asset in assets:
            if not isinstance(asset, dict) or not isinstance(asset.get("id"), str):
                errors.append("every asset requires an id")
                continue
            asset_ids.add(asset["id"])
            origin = asset.get("origin")
            exists = asset.get("exists")
            status = (asset.get("metadata") or {}).get("status") if isinstance(asset.get("metadata"), dict) else None
            if origin == "virtual" and (exists is not False or status != "placeholder"):
                errors.append(f"virtual asset {asset['id']} must use exists=false and metadata.status=placeholder")
            if origin == "existing":
                if exists is not True:
                    errors.append(f"existing asset {asset['id']} must use exists=true")
                if allowed_existing_assets is not None and asset["id"] not in allowed_existing_assets:
                    errors.append(f"existing asset {asset['id']} is not present in the supplied real examples")
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
            if command_type == primary_type.upper():
                seen_primary = True
            parameters = command.get("parameters")
            if not isinstance(parameters, dict):
                errors.append(f"{command_id or command_type} parameters must be an object")
                continue
            for _, resource_id in resource_refs(parameters):
                if resource_id not in asset_ids:
                    warnings.append(f"resource id {resource_id} is not declared in asset_catalog")
        if not seen_primary:
            errors.append(f"primary command type {primary_type} is missing")
        return {"valid": not errors, "errors": errors, "warnings": sorted(set(warnings))}
