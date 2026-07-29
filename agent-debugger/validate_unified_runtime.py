#!/usr/bin/env python3
"""Execute each unified SFT record through the browser-runtime handler set.

This creates separate immutable pass/fail views. Source corpora and the unified
collection remain untouched; only the `runtime_validation` metadata on emitted
views indicates acceptance for QLoRA formatting.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "training-data" / "level-authoring-sft-v1.jsonl"
RUNNER = Path(__file__).with_name("runtime_level_dry_run.js")
PLACEHOLDER_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9ZwAAAABJRU5ErkJggg=="
PLACEHOLDER_AUDIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
RESOURCE_FIELDS = {
    "resourceId": "image", "imageId": "image", "frontResourceId": "image", "backResourceId": "image",
    "overlayResourceId": "image", "selectedResourceId": "image", "skinId": "image", "buttonSkinId": "image",
    "musicId": "audio", "soundId": "audio", "audioId": "audio", "animId": "json", "animationId": "json",
}
NESTED_FIELDS = ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands")


def walk_commands(value: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(value, list):
        return
    for command in value:
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


def resource_ids(record: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    output = record.get("output") or {}
    streams = [output.get("commands")]
    streams.extend(event.get("commands") for event in output.get("extra_events") or [] if isinstance(event, dict))
    for commands in streams:
        for command in walk_commands(commands):
            parameters = command.get("parameters") or {}
            for field, kind in RESOURCE_FIELDS.items():
                value = parameters.get(field)
                if isinstance(value, str) and value.strip() and not value.startswith("{"):
                    result.setdefault(value, kind)
            for field in ("resourceIds",):
                for value in parameters.get(field) or []:
                    if isinstance(value, str) and value.strip():
                        result.setdefault(value, "image")
    return result


def placeholder(resource_id: str, kind: str) -> dict[str, Any]:
    if kind == "audio":
        url = PLACEHOLDER_AUDIO
    elif kind == "json":
        url = "data:application/json,%7B%22timeline%22%3A%5B%5D%7D"
    else:
        url = PLACEHOLDER_IMAGE
    return {"id": resource_id, "type": kind, "url": url, "preload": True, "metadata": {"runtime_validation_placeholder": True}}


def build_game(record: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    output = record.get("output") or {}
    input_data = record.get("input") or {}
    known: dict[str, dict[str, Any]] = {}
    for asset in input_data.get("asset_catalog") or []:
        if isinstance(asset, dict) and isinstance(asset.get("id"), str):
            kind = str(asset.get("type") or "image")
            known[asset["id"]] = {"id": asset["id"], "type": kind, "url": asset.get("url") or asset.get("path") or PLACEHOLDER_IMAGE, "preload": True}
    placeholders: list[str] = []
    for resource_id, kind in resource_ids(record).items():
        if resource_id not in known:
            known[resource_id] = placeholder(resource_id, kind)
            placeholders.append(resource_id)
    level = {
        "id": "runtime-validation-level", "name": "Runtime validation level", "initialState": {},
        "commands": deepcopy(output.get("commands") or []), "events": deepcopy(output.get("extra_events") or []),
        "resources": sorted(known), "validation": [], "canvasWidth": 800, "canvasHeight": 600,
    }
    level["initialState"] = deepcopy(input_data.get("runtime_initial_state") or {})
    game = {"id": "runtime-validation-game", "name": "Runtime validation game", "version": "1", "globalVariables": {}, "globalSwitches": {}, "resources": list(known.values()), "levels": [level]}
    return game, placeholders


def run_all(records: list[dict[str, Any]], timeout: float, batch_size: int) -> list[dict[str, Any]]:
    """Run bounded batches; a pathological sample cannot poison the whole corpus."""
    def invoke(chunk: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
        built = [build_game(record) for record in chunk]
        try:
            payload_games = [
                {"game": game, "evaluation": record.get("runtime_evaluation") or {}}
                for record, (game, _) in zip(chunk, built)
            ]
            completed = subprocess.run(["node", str(RUNNER)], cwd=ROOT, input=json.dumps({"games": payload_games, "compact": True}, ensure_ascii=False), text=True, capture_output=True, timeout=timeout, check=False)
            raw = completed.stdout.strip()
            payload = json.loads(raw) if raw else {"results": []}
            runtime_results = payload.get("results") if isinstance(payload, dict) else None
            if isinstance(runtime_results, list) and len(runtime_results) == len(chunk):
                return [
                    {"sample_id": record.get("sample_id"), "source_dataset": record.get("source_dataset"), "valid": bool(result.get("valid")), "placeholder_resources": placeholders, "runtime": result}
                    for record, (_, placeholders), result in zip(chunk, built, runtime_results)
                ]
        except (subprocess.TimeoutExpired, json.JSONDecodeError):
            pass
        return None

    results: list[dict[str, Any]] = []
    for start in range(0, len(records), max(1, batch_size)):
        chunk = records[start:start + max(1, batch_size)]
        accepted = invoke(chunk)
        if accepted is not None:
            results.extend(accepted)
            continue
        # Retry individually after a failed batch so the report identifies the
        # actual record instead of pessimistically rejecting its neighbours.
        for record in chunk:
            single = invoke([record])
            if single is not None:
                results.extend(single)
            else:
                results.append({"sample_id": record.get("sample_id"), "source_dataset": record.get("source_dataset"), "valid": False, "placeholder_resources": [], "runtime": {"valid": False, "errors": [{"error": f"runtime runner timed out or returned malformed JSON after {timeout}s"}]}})
    return results

def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def compact_runtime(result: dict[str, Any]) -> dict[str, Any]:
    """Persist acceptance evidence, not high-volume handler trace diagnostics."""
    return {
        "valid": bool(result.get("valid")),
        "errors": result.get("errors") or [],
        "main_result_count": len(result.get("mainResults") or []),
        "event_execution_count": len(result.get("eventExecutions") or []),
        "registered_handlers": result.get("registeredHandlers"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Final real-JavaScript runtime gate for unified level-authoring SFT")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--passed", type=Path, default=ROOT / "training-data" / "level-authoring-sft-v1-runtime-passed.jsonl")
    parser.add_argument("--failed", type=Path, default=ROOT / "training-data" / "level-authoring-sft-v1-runtime-failed.jsonl")
    parser.add_argument("--report", type=Path, default=ROOT / "training-data" / "level-authoring-sft-v1-runtime-validation.json")
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    records = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.limit:
        records = records[:args.limit]
    results = run_all(records, args.timeout, args.batch_size)
    by_source = Counter(result["source_dataset"] for result in results if result["valid"])
    error_counts: Counter[str] = Counter()
    command_counts: Counter[str] = Counter()
    failed_rows: list[dict[str, Any]] = []
    passed_rows: list[dict[str, Any]] = []
    by_sample = {result["sample_id"]: result for result in results}
    for record in records:
        result = by_sample[record.get("sample_id")]
        enriched = deepcopy(record)
        compact = compact_runtime(result["runtime"])
        enriched["runtime_validation"] = {"validator": "runtime_level_dry_run.js", "valid": result["valid"], "placeholder_resources": result["placeholder_resources"], "evidence": compact}
        if result["valid"]:
            passed_rows.append(enriched)
            continue
        errors = compact["errors"]
        enriched["runtime_validation"]["errors"] = errors
        failed_rows.append(enriched)
        for error in errors:
            message = str(error.get("error") if isinstance(error, dict) else error)
            error_counts[message] += 1
            if isinstance(error, dict) and error.get("type"):
                command_counts[str(error["type"]).upper()] += 1
    write_jsonl(args.passed, passed_rows)
    write_jsonl(args.failed, failed_rows)
    report = {
        "schema_version": "vibe-level-authoring-runtime-validation-v1", "input": str(args.input.resolve().relative_to(ROOT)),
        "runtime_chain": "CommandExecutor + browser/Pixi handler registration + generated GameConfig/resources/level/events",
        "interactive_policy": "replays per-sample runtime_evaluation actions when supplied; legacy samples retain registration and handler execution validation",
        "total": len(results), "valid": len(passed_rows), "invalid": len(failed_rows),
        "passed_by_source": dict(sorted(by_source.items())), "error_counts": error_counts.most_common(), "failed_command_types": command_counts.most_common(),
        "results": [{
            "sample_id": result["sample_id"], "source_dataset": result["source_dataset"],
            "valid": result["valid"], "placeholder_resources": result["placeholder_resources"],
            "runtime": compact_runtime(result["runtime"]),
        } for result in results],
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"total": len(results), "valid": len(passed_rows), "invalid": len(failed_rows), "passed": str(args.passed), "failed": str(args.failed), "report": str(args.report)}, ensure_ascii=False))
    return 0 if not failed_rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
