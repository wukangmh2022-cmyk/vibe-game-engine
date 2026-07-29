#!/usr/bin/env python3
"""Concurrent, reproducible Base-vs-Adapter evaluation through an OpenAI API."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEBUGGER = ROOT / "agent-debugger"
import sys
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(DEBUGGER))
from training.dsl.level_dsl import compile_patch
from training.eval.user_prompt import render_level_dsl_user_prompt
from command_db import CommandDatabase, build_command_database
from command_validator import CommandSampleValidator, walk_commands
try:  # Supports both `python training/eval/...` and package-style regression imports.
    from .editor_prompt import editor_system_prompt
    from .eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings
except ImportError:
    from editor_prompt import editor_system_prompt
    from eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings


def parse_response(content: str, *, intent: str = "", asset_catalog: list[dict[str, Any]] | None = None) -> dict[str, Any]:
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
    return matches[-1]


def request_completion(config: dict[str, Any], messages: list[dict[str, str]]) -> tuple[str, dict[str, Any], float]:
    started = time.monotonic()
    payload = {"model": config["model"], "messages": messages, "temperature": config["temperature"], "max_tokens": config["max_tokens"], "chat_template_kwargs": {"enable_thinking": False}}
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
    return str(choices[0].get("message", {}).get("content") or ""), data.get("usage") or {}, time.monotonic() - started


def make_messages(benchmark: dict[str, Any], case: dict[str, Any], guidance_mode: str = "full") -> list[dict[str, str]]:
    messages = [{"role": "user", "content": render_level_dsl_user_prompt(
        case["intent"], case.get("asset_catalog", []),
        int(case.get("canvas_width", 800)), int(case.get("canvas_height", 600)),
    )}]
    if guidance_mode == "full":
        messages.insert(0, {"role": "system", "content": editor_system_prompt()})
    return messages


def evaluate_one(case: dict[str, Any], benchmark: dict[str, Any], config: dict[str, Any], database_path: Path) -> dict[str, Any]:
    started_at = datetime.now(timezone.utc).isoformat()
    result: dict[str, Any] = {"case_id": case["id"], "run": config["name"], "model": config["model"], "started_at": started_at, "primary_command_type": case["primary_command_type"], "sample_mode": case["sample_mode"]}
    try:
        raw, usage, latency = request_completion(config, make_messages(benchmark, case, config["guidance_mode"]))
        result.update({"raw_output": raw, "latency_seconds": round(latency, 3), "usage": usage})
        sample = parse_response(raw, intent=case["intent"], asset_catalog=case["asset_catalog"])
        allowed_assets = {asset["id"]: asset for asset in case["asset_catalog"]}
        case_kind = case.get("case_kind", "command")
        min_commands = 3 if case_kind == "module" else (2 if case["sample_mode"] == "motif" else 1)
        max_commands = 12 if case_kind == "module" else 4
        validation = CommandSampleValidator(CommandDatabase(database_path)).validate(sample, case["primary_command_type"], min_commands, allowed_assets, max_commands=max_commands)
        seen_types = {str(command.get("type", "")).upper() for command in walk_commands(sample.get("commands") or [])}
        required_types = {str(value).upper() for value in case.get("required_command_types", [case["primary_command_type"]])}
        missing_required_types = sorted(required_types - seen_types)
        result.update({"sample": sample, "validation": validation, "required_types_passed": not missing_required_types, "missing_required_command_types": missing_required_types, "passed": bool(validation["valid"]) and not missing_required_types})
    except Exception as error:
        result.update({"passed": False, "error": str(error)})
    return result


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def parse_run(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError("--run must be name=model-id")
    name, model = raw.split("=", 1)
    if not name or not model:
        raise argparse.ArgumentTypeError("--run must be name=model-id")
    return name, model


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate Base and Adapter on the fixed Vibe command benchmark")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="Local dotenv file; default: agent-debugger/.env")
    parser.add_argument("--profile", choices=["qwen36_27b", "qwen35_9b", "adapter"], action="append", help="Named endpoint from --env-file; repeat to compare models")
    parser.add_argument("--api-base", default="")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--run", type=parse_run, action="append", help="Repeat: base=model-id --run adapter=model-id (uses legacy VIBE_EVAL_API_BASE/API_KEY)")
    parser.add_argument("--workers", type=int, default=4, help="Default 4; use 1 for serial Transformers or tune upward after vLLM load testing")
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--max-tokens", type=int, default=768)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--without-guidance", action="store_true", help="Do not inject the editor's full level-patch guidance; the benchmark task contract remains unchanged")
    parser.add_argument("--project", default=str(ROOT / "customer-demo"))
    parser.add_argument("--cases", default=str(Path(__file__).with_name("cases") / "command_benchmark_v1.json"))
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
        parser.error("workers must be between 1 and 32")

    benchmark = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    cases = benchmark.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SystemExit("benchmark has no cases")
    database_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(Path(args.project), database_path)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    guidance_mode = "none" if args.without_guidance else "full"
    run_dir = Path(args.output_dir) / f"command-benchmark-v1-{guidance_mode}-{timestamp}"
    configs = [{**config, "temperature": args.temperature, "max_tokens": args.max_tokens, "timeout": args.timeout, "guidance_mode": guidance_mode} for config in configs]
    jobs = [(case, config) for config in configs for case in cases]
    results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(evaluate_one, case, benchmark, config, database_path) for case, config in jobs]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda item: (item["run"], item["case_id"]))
    write_jsonl(run_dir / "results.jsonl", results)
    summary: dict[str, Any] = {"benchmark": benchmark["schema_version"], "prompt_mode": "vge_dsl_1_canonical", "guidance_mode": guidance_mode, "case_count": len(cases), "runs": {}}
    for config in configs:
        rows = [row for row in results if row["run"] == config["name"]]
        passed = [row for row in rows if row.get("passed")]
        latencies = [row["latency_seconds"] for row in rows if isinstance(row.get("latency_seconds"), (int, float))]
        by_kind: dict[str, dict[str, int]] = {}
        for row in rows:
            kind = "module" if str(row["case_id"]).startswith("module-") else "command"
            by_kind.setdefault(kind, {"total": 0, "passed": 0})
            by_kind[kind]["total"] += 1
            by_kind[kind]["passed"] += int(bool(row.get("passed")))
        summary["runs"][config["name"]] = {"model": config["model"], "total": len(rows), "passed": len(passed), "pass_rate": round(len(passed) / len(rows), 4) if rows else 0, "runtime_passed": sum(bool((row.get("validation") or {}).get("runtime", {}).get("valid")) for row in rows), "mean_latency_seconds": round(sum(latencies) / len(latencies), 3) if latencies else None, "by_kind": by_kind, "failures": [{"case_id": row["case_id"], "error": row.get("error") or (row.get("validation") or {}).get("errors", []) or (["missing required command types: " + ", ".join(row.get("missing_required_command_types", []))] if row.get("missing_required_command_types") else [])} for row in rows if not row.get("passed")]}
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"run_dir": str(run_dir), "summary": summary}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
