"""Read-only command example database for Vibe Game Engine scenes."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable

RESOURCE_KEYS = {"resourceId", "soundId", "musicId", "imageId", "skinId", "backResourceId", "frontResourceId"}
NESTED_COMMAND_FIELDS = ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands")


def dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def text_values(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from text_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from text_values(child)


def resource_refs(value: Any, pointer: str = "parameters") -> Iterable[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_pointer = f"{pointer}.{key}"
            if key in RESOURCE_KEYS and isinstance(child, str) and child:
                yield child_pointer, child
            yield from resource_refs(child, child_pointer)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from resource_refs(child, f"{pointer}[{index}]")


class CommandDatabase:
    def __init__(self, path: Path):
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def stats(self) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS levels FROM levels").fetchone()
            commands = connection.execute("SELECT COUNT(*) AS commands FROM commands").fetchone()
            types = connection.execute("SELECT command_type, COUNT(*) AS count FROM commands GROUP BY command_type ORDER BY count DESC").fetchall()
        return {"levels": row["levels"], "commands": commands["commands"], "command_types": [dict(item) for item in types]}

    def project_path(self) -> Path:
        with self.connect() as connection:
            row = connection.execute("SELECT value FROM metadata WHERE key = 'project'").fetchone()
        if not row:
            raise RuntimeError("command database has no project metadata")
        return Path(row["value"])

    def find_commands(self, command_type: str = "", query: str = "", limit: int = 5) -> list[dict[str, Any]]:
        clauses = []
        values: list[Any] = []
        if command_type:
            clauses.append("command_type = ?")
            values.append(command_type.upper())
        if query:
            clauses.append("search_text LIKE ?")
            values.append(f"%{query}%")
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        sql = f"""
          SELECT command_key, scene_path, level_key, level_name, stream_key, ordinal,
                 command_id, command_type, command_json
          FROM commands{where}
          ORDER BY scene_path, level_key, stream_key, ordinal
          LIMIT ?
        """
        with self.connect() as connection:
            rows = connection.execute(sql, [*values, max(1, min(limit, 30))]).fetchall()
        return [{**dict(row), "command": json.loads(row["command_json"])} for row in rows]

    def command_context(self, command_key: str, before: int = 5, after: int = 5) -> dict[str, Any]:
        before = max(0, min(before, 10))
        after = max(0, min(after, 10))
        with self.connect() as connection:
            target = connection.execute("SELECT * FROM commands WHERE command_key = ?", [command_key]).fetchone()
            if not target:
                raise KeyError(f"unknown command_key: {command_key}")
            rows = connection.execute(
                """
                SELECT command_key, ordinal, command_id, command_type, command_json
                FROM commands
                WHERE level_key = ? AND stream_key = ? AND ordinal BETWEEN ? AND ?
                ORDER BY ordinal
                """,
                [target["level_key"], target["stream_key"], target["ordinal"] - before, target["ordinal"] + after],
            ).fetchall()
        return {
            "target": {key: target[key] for key in ("command_key", "scene_path", "level_key", "level_name", "stream_key", "ordinal")},
            "commands": [{**dict(row), "command": json.loads(row["command_json"])} for row in rows],
        }

    def level_metadata(self, level_key: str) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM levels WHERE level_key = ?", [level_key]).fetchone()
        if not row:
            raise KeyError(f"unknown level_key: {level_key}")
        data = dict(row)
        for key in ("resources_json", "metadata_json", "command_types_json"):
            data[key.removesuffix("_json")] = json.loads(data.pop(key))
        return data


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA journal_mode=WAL;
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE levels (
          level_key TEXT PRIMARY KEY,
          scene_path TEXT NOT NULL,
          scene_id TEXT,
          scene_name TEXT,
          level_index INTEGER NOT NULL,
          level_id TEXT,
          level_name TEXT,
          canvas_width INTEGER,
          canvas_height INTEGER,
          resources_json TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          command_types_json TEXT NOT NULL,
          command_count INTEGER NOT NULL,
          event_count INTEGER NOT NULL
        );
        CREATE TABLE commands (
          command_key TEXT PRIMARY KEY,
          level_key TEXT NOT NULL,
          scene_path TEXT NOT NULL,
          level_name TEXT,
          stream_key TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          command_id TEXT,
          command_type TEXT NOT NULL,
          command_json TEXT NOT NULL,
          search_text TEXT NOT NULL
        );
        CREATE TABLE resource_refs (
          command_key TEXT NOT NULL,
          field_path TEXT NOT NULL,
          resource_id TEXT NOT NULL
        );
        CREATE INDEX idx_commands_type ON commands(command_type);
        CREATE INDEX idx_commands_stream ON commands(level_key, stream_key, ordinal);
        CREATE INDEX idx_commands_search ON commands(search_text);
        CREATE INDEX idx_refs_resource ON resource_refs(resource_id);
        """
    )


def index_stream(connection: sqlite3.Connection, scene_path: str, level_key: str, level_name: str, stream_key: str, commands: list[Any], command_types: set[str]) -> int:
    count = 0
    for ordinal, command in enumerate(commands):
        if not isinstance(command, dict):
            continue
        command_type = str(command.get("type", "UNKNOWN")).upper()
        command_id = str(command.get("id", ""))
        command_key = f"{level_key}::{stream_key}::{ordinal}"
        command_types.add(command_type)
        searchable = " ".join(text_values(command))[:12000]
        connection.execute(
            "INSERT INTO commands VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [command_key, level_key, scene_path, level_name, stream_key, ordinal, command_id, command_type, dump(command), searchable],
        )
        for field_path, resource_id in resource_refs(command.get("parameters", {})):
            connection.execute("INSERT INTO resource_refs VALUES (?, ?, ?)", [command_key, field_path, resource_id])
        count += 1
        parameters = command.get("parameters", {})
        if isinstance(parameters, dict):
            for field in NESTED_COMMAND_FIELDS:
                nested = parameters.get(field)
                if isinstance(nested, list):
                    count += index_stream(connection, scene_path, level_key, level_name, f"{stream_key}/{ordinal}/{field}", nested, command_types)
            options = parameters.get("options")
            if isinstance(options, list):
                for option_index, option in enumerate(options):
                    nested = option.get("commands") if isinstance(option, dict) else None
                    if isinstance(nested, list):
                        count += index_stream(connection, scene_path, level_key, level_name, f"{stream_key}/{ordinal}/options/{option_index}", nested, command_types)
    return count


def build_command_database(project: Path, output: Path) -> dict[str, Any]:
    project = project.resolve()
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    connection = sqlite3.connect(output)
    try:
        create_schema(connection)
        level_count = 0
        for scene_file in sorted((project / "scene").glob("**/*.json")):
            try:
                scene = json.loads(scene_file.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(scene, dict):
                continue
            scene_path = scene_file.relative_to(project).as_posix()
            levels = scene.get("levels") if isinstance(scene.get("levels"), list) else []
            for index, level in enumerate(levels):
                if not isinstance(level, dict):
                    continue
                level_id = str(level.get("id", f"index-{index}"))
                level_key = f"{scene_path}::{index}::{level_id}"
                level_name = str(level.get("name", level_id))
                command_types: set[str] = set()
                command_count = index_stream(connection, scene_path, level_key, level_name, "main", level.get("commands", []) if isinstance(level.get("commands"), list) else [], command_types)
                events = level.get("events", []) if isinstance(level.get("events"), list) else []
                for event_index, event in enumerate(events):
                    event_commands = event.get("commands") if isinstance(event, dict) and isinstance(event.get("commands"), list) else []
                    event_name = str(event.get("id") or event.get("name") or event_index) if isinstance(event, dict) else str(event_index)
                    command_count += index_stream(connection, scene_path, level_key, level_name, f"event/{event_name}", event_commands, command_types)
                resource_catalog = flatten_resources(scene.get("resources"))
                level_resource_ids = {str(resource_id) for resource_id in level.get("resources", []) if isinstance(resource_id, str)}
                resources = [resource_catalog[resource_id] for resource_id in sorted(level_resource_ids) if resource_id in resource_catalog]
                metadata = {
                    "description": level.get("description"),
                    "initial_state": level.get("initialState", {}),
                    "event_ids": [event.get("id") for event in events if isinstance(event, dict)],
                }
                connection.execute(
                    "INSERT INTO levels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        level_key, scene_path, str(scene.get("id", "")), str(scene.get("name", "")), index,
                        level_id, level_name, level.get("canvasWidth"), level.get("canvasHeight"),
                        dump(resources), dump(metadata), dump(sorted(command_types)), command_count, len(events),
                    ],
                )
                level_count += 1
        connection.execute("INSERT INTO metadata VALUES (?, ?)", ["project", str(project)])
        connection.commit()
    finally:
        connection.close()
    stats = CommandDatabase(output).stats()
    return {"database": str(output), "level_count": level_count, **stats}


def flatten_resources(value: Any) -> dict[str, dict[str, Any]]:
    """Normalize a scene resource object to ids usable by the teaching tools."""
    if not isinstance(value, dict):
        return {}
    kind_map = {"images": "image", "audios": "audio", "animations": "animation", "videos": "video"}
    result: dict[str, dict[str, Any]] = {}
    for group, kind in kind_map.items():
        items = value.get(group)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            resource_id = item["id"]
            source = item.get("src") or item.get("url")
            if not isinstance(source, str) or not source:
                continue
            result[resource_id] = {
                "id": resource_id,
                "type": kind,
                "path": source,
                "name": item.get("name") if isinstance(item.get("name"), str) else resource_id,
            }
    return result
