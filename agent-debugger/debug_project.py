#!/usr/bin/env python3
"""Create a compact, text-only project index for trajectory generation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RESOURCE_KEYS = {"resourceId", "soundId", "musicId", "imageId", "skinId"}


def load_json(path: Path) -> tuple[Any | None, str | None]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except Exception as error:
        return None, str(error)


def infer_type(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return "image"
    if suffix in {".mp3", ".wav", ".ogg", ".m4a"}:
        return "audio"
    if suffix in {".mp4", ".webm"}:
        return "video"
    if suffix == ".json":
        return "json"
    return "unknown"


def add_resource(resources: dict[str, dict[str, Any]], project: Path, item: dict[str, Any], source: str) -> None:
    resource_id = item.get("id")
    resource_path = item.get("url") or item.get("src")
    if not isinstance(resource_id, str) or not isinstance(resource_path, str):
        return
    virtual = resource_path.startswith("virtual://")
    exists = virtual or (project / resource_path.lstrip("./")).exists()
    resources.setdefault(resource_id, {
        "id": resource_id,
        "type": item.get("type") or infer_type(resource_path),
        "path": resource_path,
        "origin": "virtual" if virtual else "existing",
        "exists": exists,
        "metadata": item.get("metadata", {}),
        "sources": [],
    })["sources"].append(source)


def walk(value: Any, project: Path, resources: dict[str, dict[str, Any]], refs: list[dict[str, str]], source: str, pointer: str = "$") -> None:
    if isinstance(value, dict):
        add_resource(resources, project, value, source)
        for key, child in value.items():
            child_pointer = f"{pointer}.{key}"
            if key in RESOURCE_KEYS and isinstance(child, str) and child:
                refs.append({"source": source, "pointer": child_pointer, "resource_id": child})
            walk(child, project, resources, refs, source, child_pointer)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, project, resources, refs, source, f"{pointer}[{index}]")


def build_index(project: Path) -> dict[str, Any]:
    resources: dict[str, dict[str, Any]] = {}
    refs: list[dict[str, str]] = []
    scenes: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for path in sorted(project.rglob("*.json")):
        relative = path.relative_to(project).as_posix()
        if relative.startswith("node_modules/"):
            continue
        data, error = load_json(path)
        if error:
            errors.append({"path": relative, "error": error})
            continue
        walk(data, project, resources, refs, relative)
        if relative.startswith("scene/") and isinstance(data, dict):
            levels = data.get("levels") if isinstance(data.get("levels"), list) else []
            scenes.append({
                "path": relative,
                "id": data.get("id"),
                "name": data.get("name"),
                "level_ids": [level.get("id") for level in levels if isinstance(level, dict)],
            })

    unknown_refs = [reference for reference in refs if reference["resource_id"] not in resources]
    return {
        "schema_version": "v1",
        "project": str(project),
        "scenes": scenes,
        "resources": sorted(resources.values(), key=lambda item: item["id"]),
        "resource_references": refs,
        "unknown_resource_references": unknown_refs,
        "json_errors": errors,
        "summary": {
            "scene_count": len(scenes),
            "resource_count": len(resources),
            "unknown_reference_count": len(unknown_refs),
            "json_error_count": len(errors),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a text-only Vibe project debug index.")
    parser.add_argument("--project", default=str(ROOT / "customer-demo"), help="Game package directory")
    parser.add_argument("--output", default=str(ROOT / "agent-debugger" / "state" / "project-index.json"))
    args = parser.parse_args()

    project = Path(args.project).expanduser().resolve()
    if not project.is_dir():
        parser.error(f"project directory does not exist: {project}")
    result = build_index(project)
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "summary": result["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
