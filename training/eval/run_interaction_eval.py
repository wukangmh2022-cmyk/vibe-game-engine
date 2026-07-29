#!/usr/bin/env python3
"""Evaluate unified level-authoring outputs with deterministic player actions.

The benchmark questions are hand-authored and versioned.  Their operation
scripts and assertions are deliberately withheld from the model: a response
must survive the same CommandExecutor + browser-handler runtime used by the
editor, then make the expected state transition after simulated input.
"""

from __future__ import annotations

import argparse
import concurrent.futures
from copy import deepcopy
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEBUGGER = ROOT / "agent-debugger"
RUNNER = DEBUGGER / "runtime_level_dry_run.js"
DEFAULT_CASES = Path(__file__).with_name("heldout_interaction_benchmark_v3.py")
sys.path.insert(0, str(DEBUGGER))
sys.path.insert(0, str(ROOT))
from training.dsl.level_dsl import compile_patch
from training.eval.user_prompt import render_level_dsl_user_prompt
from event_coordination_validator import EventCoordinationValidator, command_resource_refs, walk_commands
from validate_unified_runtime import PLACEHOLDER_AUDIO, PLACEHOLDER_IMAGE
try:  # Supports both `python training/eval/...` and package-style regression imports.
    from .editor_prompt import editor_system_prompt
    from .eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings
except ImportError:
    from editor_prompt import editor_system_prompt
    from eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings


def parse_response(content: str, *, intent: str = "", asset_catalog: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Extract the final complete level object from regular or thinking output."""
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return compile_patch(text, intent=intent, asset_catalog=asset_catalog or [])
    except ValueError:
        pass
    decoder = json.JSONDecoder()
    candidates: list[dict[str, Any]] = []
    for offset, character in enumerate(text):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text, offset)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            candidates.append(value)
    required = {"intent", "asset_catalog", "commands", "extra_events"}
    matches = [value for value in candidates if required <= set(value)]
    if not matches:
        raise ValueError("response did not contain a complete level JSON object with intent, asset_catalog, commands, and extra_events")
    # Reasoning can contain drafts and JSON examples. The final complete object
    # is the last one emitted by the model.
    return matches[-1]


def load_benchmark(path: Path) -> dict[str, Any]:
    if path.suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    if path.suffix == ".py":
        spec = importlib.util.spec_from_file_location("vibe_interaction_benchmark", path)
        if not spec or not spec.loader:
            raise ValueError(f"could not load benchmark module: {path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        benchmark = module.benchmark()
        if not isinstance(benchmark, dict):
            raise ValueError(f"benchmark module did not return an object: {path}")
        return benchmark
    raise ValueError(f"unsupported benchmark format: {path}")


def request_completion(config: dict[str, Any], messages: list[dict[str, str]]) -> tuple[str, dict[str, Any], float]:
    started = time.monotonic()
    payload: dict[str, Any] = {
        "model": config["model"], "messages": messages,
        "temperature": config["temperature"], "max_tokens": config["max_tokens"],
    }
    payload["chat_template_kwargs"] = {"enable_thinking": False}
    request = urllib.request.Request(
        config["api_base"].rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {config['api_key']}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
            data = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}: {error.read().decode(errors='replace')[-500:]}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"connection failed: {error.reason}") from error
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("response has no choices")
    message = choices[0].get("message") or {}
    answer = str(message.get("content") or "")
    reasoning = str(message.get("reasoning_content") or "")
    # Persist unexpected reasoning separately in the artifact for diagnostics;
    # production DSL evaluation still requests thinking=false.
    raw = f"<think>\n{reasoning}\n</think>\n\n{answer}" if reasoning else answer
    return raw, data.get("usage") or {}, time.monotonic() - started


def make_messages(benchmark: dict[str, Any], case: dict[str, Any], guidance_mode: str = "full") -> list[dict[str, str]]:
    messages = [{"role": "user", "content": render_level_dsl_user_prompt(
        case["intent"], case.get("asset_catalog", []),
        int(case.get("canvas_width", 800)), int(case.get("canvas_height", 600)),
    )}]
    if guidance_mode == "full":
        messages.insert(0, {"role": "system", "content": editor_system_prompt()})
    return messages


def resource_ids(commands: Iterable[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for _, resource_id in command_resource_refs({"commands": list(commands)}):
        ids.add(resource_id)
    return ids


def _command_type(command: dict[str, Any]) -> str:
    return str(command.get("type") or "").upper()


def _parameters(command: dict[str, Any]) -> dict[str, Any]:
    value = command.get("parameters")
    return value if isinstance(value, dict) else {}


def _emitted_signals(commands: Iterable[dict[str, Any]]) -> set[str]:
    return {
        signal for command in commands if _command_type(command) == "EMIT_SIGNAL"
        if isinstance((signal := _parameters(command).get("signal")), str) and signal
    }


def _sets_boolean(commands: Iterable[dict[str, Any]], value: bool | None = None) -> set[str]:
    result: set[str] = set()
    for command in commands:
        if _command_type(command) != "SET_VARIABLE":
            continue
        parameters = _parameters(command)
        key = parameters.get("key")
        if not isinstance(key, str) or not key:
            continue
        if value is None or parameters.get("value") is value:
            result.add(key)
    return result


def semantic_contract_errors(sample: dict[str, Any], case: dict[str, Any]) -> list[str]:
    """Check hidden behavioral relations without imposing generated names.

    IDs, variables, and signals are all discovered from the candidate output.
    The checks enforce only the causal relations described by the natural prompt.
    """
    commands = list(walk_commands(sample.get("commands") or []))
    events = [event for event in sample.get("extra_events") or [] if isinstance(event, dict)]

    def by_type(stream: Iterable[dict[str, Any]], name: str) -> list[dict[str, Any]]:
        return [command for command in stream if _command_type(command) == name]

    def listener_events(signal: str) -> list[dict[str, Any]]:
        return [
            event for event in events
            if any(trigger.get("type") == "custom" and trigger.get("target") == signal for trigger in event.get("triggers") or [] if isinstance(trigger, dict))
        ]

    category = case["category"]
    errors: list[str] = []
    clickable = by_type(commands, "SET_CLICKABLE")

    if category == "click_event":
        linked = False
        for command in clickable:
            for signal in _emitted_signals(walk_commands(_parameters(command).get("commands") or [])):
                if any(_sets_boolean(walk_commands(event.get("commands") or []), True) for event in listener_events(signal)):
                    linked = True
        if not linked:
            errors.append("click-event requires a click-triggered signal whose listener records completion")

    if category == "auto_event":
        linked = False
        for event in events:
            if not any(trigger.get("type") == "auto" and trigger.get("start") == "immediate" for trigger in event.get("triggers") or [] if isinstance(trigger, dict)):
                continue
            for signal in _emitted_signals(walk_commands(event.get("commands") or [])):
                if any(_sets_boolean(walk_commands(listener.get("commands") or []), True) for listener in listener_events(signal)):
                    linked = True
        if not linked:
            errors.append("auto-event requires an immediate preparation event that drives a completion listener")

    if category == "complex_coordination":
        ready_variables: set[str] = set()
        for event in events:
            if not any(trigger.get("type") == "auto" and trigger.get("start") == "immediate" for trigger in event.get("triggers") or [] if isinstance(trigger, dict)):
                continue
            for signal in _emitted_signals(walk_commands(event.get("commands") or [])):
                for listener in listener_events(signal):
                    ready_variables.update(_sets_boolean(walk_commands(listener.get("commands") or []), True))
        if not ready_variables:
            errors.append("complex coordination requires an automatic preparation chain")

        confirmation_events: list[dict[str, Any]] = []
        for command in clickable:
            for signal in _emitted_signals(walk_commands(_parameters(command).get("commands") or [])):
                confirmation_events.extend(listener_events(signal))
        if not confirmation_events:
            errors.append("complex coordination requires a click-triggered independent confirmation event")
        elif not any(
            _parameters(condition).get("condition", {}).get("type") == "variable"
            and _parameters(condition).get("condition", {}).get("key") in ready_variables
            and bool(_sets_boolean(walk_commands(_parameters(condition).get("trueCommands") or []), True)
                     & _sets_boolean(walk_commands(_parameters(condition).get("falseCommands") or []), False))
            for event in confirmation_events
            for condition in by_type(walk_commands(event.get("commands") or []), "IF_CONDITION")
        ):
            errors.append("complex coordination requires the confirmation event to branch on preparation state")

    return errors


def validate_output(sample: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    required_fields = {"intent", "asset_catalog", "commands", "extra_events"}
    missing_fields = sorted(required_fields - set(sample))
    unknown_fields = sorted(set(sample) - required_fields)
    if missing_fields:
        errors.append("missing unified output fields: " + ", ".join(missing_fields))
    if unknown_fields:
        errors.append("unsupported unified output fields: " + ", ".join(unknown_fields))
    if not isinstance(sample.get("intent"), str) or not sample["intent"].strip():
        errors.append("intent must be a non-empty string")
    commands = sample.get("commands")
    events = sample.get("extra_events")
    assets = sample.get("asset_catalog")
    if not isinstance(commands, list) or not commands:
        errors.append("commands must be a non-empty array")
        commands = []
    if not isinstance(events, list):
        errors.append("extra_events must be an array")
        events = []
    if not isinstance(assets, list):
        errors.append("asset_catalog must be an array")
        assets = []

    allowed_assets = {asset["id"]: asset for asset in case.get("asset_catalog", []) if isinstance(asset, dict) and isinstance(asset.get("id"), str)}
    copied_assets: dict[str, dict[str, Any]] = {}
    for asset in assets:
        if not isinstance(asset, dict) or not isinstance(asset.get("id"), str):
            errors.append("every asset_catalog item requires an id")
            continue
        asset_id = asset["id"]
        expected = allowed_assets.get(asset_id)
        if not expected:
            errors.append(f"asset {asset_id} is not exposed by this test case")
            continue
        copied_assets[asset_id] = asset
        for field in ("id", "type", "path", "origin", "exists"):
            if field in expected and asset.get(field) != expected.get(field):
                errors.append(f"asset {asset_id} {field} must match the supplied catalog")

    streams = list(commands)
    for event in events:
        if isinstance(event, dict) and isinstance(event.get("commands"), list):
            streams.extend(event["commands"])
    referenced = resource_ids(streams)
    missing_assets = sorted(referenced - set(copied_assets))
    if missing_assets:
        errors.append("referenced resources missing from output asset_catalog: " + ", ".join(missing_assets))
    extra_assets = sorted(set(copied_assets) - referenced)
    if extra_assets:
        errors.append("output asset_catalog includes unreferenced resources: " + ", ".join(extra_assets))

    required = {str(value).upper() for value in case["required_command_types"]}
    seen = {str(command.get("type", "")).upper() for command in walk_commands(commands)}
    for event in events:
        if isinstance(event, dict):
            seen.update(str(command.get("type", "")).upper() for command in walk_commands(event.get("commands")))
    missing_types = sorted(required - seen)
    if missing_types:
        errors.append("missing required command types: " + ", ".join(missing_types))

    # A pure interaction case legitimately has no extra event. Cross-event
    # cases use the stricter graph-completeness mode; ordinary cases retain all
    # structural checks without inventing a requirement absent from the prompt.
    event_validation = EventCoordinationValidator().validate(
        {"input": {"asset_catalog": case.get("asset_catalog", [])}, "output": {"commands": commands, "extra_events": events}},
        mode="complete_patch" if events else "level_context",
    )
    errors.extend(event_validation["errors"])
    errors.extend(semantic_contract_errors(sample, case))
    return {"valid": not errors, "errors": sorted(set(errors)), "event_validation": event_validation, "missing_required_command_types": missing_types}


def placeholder(asset: dict[str, Any]) -> dict[str, Any]:
    kind = str(asset.get("type") or "image")
    if kind == "audio":
        url = PLACEHOLDER_AUDIO
    elif kind in {"json", "animation"}:
        url = "data:application/json,%7B%22timeline%22%3A%5B%5D%7D"
    else:
        url = PLACEHOLDER_IMAGE
    return {"id": asset["id"], "type": kind, "url": url, "preload": True}


def build_game(sample: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    resources = [placeholder(asset) for asset in case.get("asset_catalog", []) if isinstance(asset, dict) and isinstance(asset.get("id"), str)]
    level = {
        "id": f"benchmark-{case['id']}", "name": case["id"], "initialState": {},
        "commands": sample["commands"], "events": sample["extra_events"], "resources": [item["id"] for item in resources],
        "validation": [], "canvasWidth": 800, "canvasHeight": 600,
    }
    return {"id": "interaction-benchmark", "name": "Interaction benchmark", "version": "1", "globalVariables": {}, "globalSwitches": {}, "resources": resources, "levels": [level]}


def resolve_evaluation(sample: dict[str, Any], evaluation: dict[str, Any]) -> dict[str, Any]:
    """Resolve hidden semantic targets from the model's own command output."""
    commands = list(walk_commands(sample.get("commands") or []))
    for event in sample.get("extra_events") or []:
        if isinstance(event, dict):
            commands.extend(walk_commands(event.get("commands") or []))

    def resolve_selector(selector: dict[str, Any]) -> str:
        expected_type = str(selector.get("command_type") or "").upper()
        for command in commands:
            if str(command.get("type") or "").upper() != expected_type:
                continue
            element_id = (command.get("parameters") or {}).get("elementId")
            if isinstance(element_id, str) and element_id:
                return element_id
        raise ValueError(f"evaluation selector found no {expected_type} element")

    resolved = deepcopy(evaluation)
    for action in resolved.get("actions") or []:
        if isinstance(action, dict) and isinstance(action.get("target_selector"), dict):
            action["target"] = resolve_selector(action.pop("target_selector"))
    for assertion in resolved.get("assertions") or []:
        if isinstance(assertion, dict) and isinstance(assertion.get("target_selector"), dict):
            assertion["target"] = resolve_selector(assertion.pop("target_selector"))
    return resolved


def run_runtime(sample: dict[str, Any], case: dict[str, Any], timeout: int) -> dict[str, Any]:
    evaluation = resolve_evaluation(sample, case["oracle"])
    completed = subprocess.run(
        ["node", str(RUNNER)], cwd=ROOT,
        input=json.dumps({"game": build_game(sample, case), "evaluation": evaluation}, ensure_ascii=False),
        text=True, capture_output=True, timeout=timeout, check=False,
    )
    if completed.returncode:
        return {"valid": False, "errors": [{"error": completed.stderr[-1000:] or f"runner exited {completed.returncode}"}]}
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        return {"valid": False, "errors": [{"error": f"runner returned malformed JSON: {error}"}]}


def evaluate_one(case: dict[str, Any], benchmark: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {"case_id": case["id"], "run": config["name"], "model": config["model"], "started_at": datetime.now(timezone.utc).isoformat(), "category": case["category"]}
    try:
        raw, usage, latency = request_completion(config, make_messages(benchmark, case, config["guidance_mode"]))
        sample = parse_response(raw, intent=case["intent"], asset_catalog=case.get("asset_catalog", []))
        validation = validate_output(sample, case)
        runtime = run_runtime(sample, case, config["runtime_timeout"]) if validation["valid"] else None
        row.update({"raw_output": raw, "usage": usage, "latency_seconds": round(latency, 3), "sample": sample, "validation": validation, "runtime": runtime})
        row["passed"] = bool(validation["valid"]) and bool(runtime and runtime.get("valid")) and bool((runtime.get("interaction") or {}).get("passed"))
    except Exception as error:
        row.update({"passed": False, "error": str(error)})
    return row


def parse_run(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError("--run must be name=model-id")
    name, model = raw.split("=", 1)
    if not name or not model:
        raise argparse.ArgumentTypeError("--run must be name=model-id")
    return name, model


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate interactive level-authoring behavior with runtime actions and assertions")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="Local dotenv file; default: agent-debugger/.env")
    parser.add_argument("--profile", choices=["qwen36_27b", "qwen35_9b", "adapter"], action="append", help="Named endpoint from --env-file; repeat to compare models")
    parser.add_argument("--api-base", default="")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--run", type=parse_run, action="append", help="Repeat: base=model-id --run adapter=model-id (uses legacy VIBE_EVAL_API_BASE/API_KEY)")
    parser.add_argument("--workers", type=int, default=4, help="Default 4; use 1 for serial Transformers or tune upward after vLLM load testing")
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--max-tokens", type=int, default=768, help="VGE-DSL output budget; thinking is always disabled")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--runtime-timeout", type=int, default=10)
    parser.add_argument("--without-guidance", action="store_true", help="Do not inject the editor's full level-patch guidance; the benchmark task contract remains unchanged")
    parser.add_argument("--disable-thinking", action="store_true", default=True, help="Deprecated compatibility flag; DSL evaluation always disables thinking")
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES, help="Versioned .json or benchmark .py module")
    parser.add_argument("--output-dir", default="training/eval/results")
    args = parser.parse_args()
    if args.profile and args.run:
        parser.error("use either --profile or --run, not both")
    settings = load_settings(args.env_file)
    if args.profile:
        try:
            configs = [endpoint_from_profile(profile, settings) for profile in args.profile]
        except ValueError as error:
            parser.error(str(error))
    else:
        if not args.run:
            parser.error("provide at least one --profile or --run")
        api_base = args.api_base or settings.get("VIBE_EVAL_API_BASE", "")
        api_key = args.api_key or settings.get("VIBE_EVAL_API_KEY", "")
        if not api_base or not api_key:
            parser.error("set --api-base/--api-key, legacy VIBE_EVAL_API_BASE/API_KEY, or use a named --profile")
        configs = [{"name": name, "model": model, "api_base": api_base, "api_key": api_key} for name, model in args.run]
    if not 1 <= args.workers <= 32:
        parser.error("workers must be from 1 to 32")

    benchmark = load_benchmark(args.cases)
    cases = benchmark.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SystemExit("benchmark has no cases")
    guidance_mode = "none" if args.without_guidance else "full"
    configs = [{**config, "temperature": args.temperature, "max_tokens": args.max_tokens, "timeout": args.timeout, "runtime_timeout": args.runtime_timeout, "guidance_mode": guidance_mode, "disable_thinking": args.disable_thinking} for config in configs]
    rows: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(evaluate_one, case, benchmark, config) for config in configs for case in cases]
        for future in concurrent.futures.as_completed(futures):
            rows.append(future.result())
    rows.sort(key=lambda row: (row["run"], row["case_id"]))
    benchmark_slug = re.sub(r"[^a-z0-9]+", "-", str(benchmark["schema_version"]).lower()).strip("-")
    run_dir = Path(args.output_dir) / f"{benchmark_slug}-{guidance_mode}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    write_jsonl(run_dir / "results.jsonl", rows)
    summary: dict[str, Any] = {"benchmark": benchmark["schema_version"], "prompt_mode": "vge_dsl_1_canonical", "guidance_mode": guidance_mode, "thinking_enabled": False, "case_count": len(cases), "runs": {}}
    for config in configs:
        model_rows = [row for row in rows if row["run"] == config["name"]]
        categories: dict[str, dict[str, int]] = {}
        for row in model_rows:
            category = row["category"]
            categories.setdefault(category, {"total": 0, "passed": 0})
            categories[category]["total"] += 1
            categories[category]["passed"] += int(bool(row.get("passed")))
        structural = sum(bool((row.get("validation") or {}).get("valid")) for row in model_rows)
        runtime = sum(bool((row.get("runtime") or {}).get("valid")) for row in model_rows)
        oracle = sum(bool(((row.get("runtime") or {}).get("interaction") or {}).get("passed")) for row in model_rows)
        latencies = [row["latency_seconds"] for row in model_rows if isinstance(row.get("latency_seconds"), (int, float))]
        summary["runs"][config["name"]] = {
            "model": config["model"], "total": len(model_rows), "passed": sum(bool(row.get("passed")) for row in model_rows),
            "structural_passed": structural, "runtime_passed": runtime, "oracle_passed": oracle,
            "mean_latency_seconds": round(sum(latencies) / len(latencies), 3) if latencies else None,
            "by_category": categories,
            "failures": [{"case_id": row["case_id"], "error": row.get("error") or (row.get("validation") or {}).get("errors") or (row.get("runtime") or {}).get("errors")} for row in model_rows if not row.get("passed")],
        }
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"run_dir": str(run_dir), "summary": summary}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
