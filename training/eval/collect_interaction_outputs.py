#!/usr/bin/env python3
"""Persist model generations before any structural or runtime validation.

One process owns the output file. Each completed API response is appended,
flushed, and fsynced immediately so interruption preserves prior responses.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from .eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings
    from .run_interaction_eval import DEFAULT_CASES, load_benchmark, make_messages, parse_response, request_completion
except ImportError:
    from eval_config import DEFAULT_ENV_FILE, endpoint_from_profile, load_settings
    from run_interaction_eval import DEFAULT_CASES, load_benchmark, make_messages, parse_response, request_completion


def append_record(path: Path, record: dict[str, Any]) -> None:
    encoded = (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8")
    with path.open("ab") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())


def completed_case_ids(path: Path) -> set[str]:
    """Return only cases with a persisted model response.

    Failed requests remain in the JSONL audit trail, but must be retried after a
    service restart rather than being mistaken for completed generations.
    """
    if not path.exists():
        return set()
    completed = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if (
            isinstance(record, dict)
            and isinstance(record.get("case_id"), str)
            and isinstance(record.get("raw_output"), str)
        ):
            completed.add(record["case_id"])
    return completed


def seen_case_ids(path: Path) -> set[str]:
    """Return all recorded case IDs for audit/reporting compatibility."""
    if not path.exists():
        return set()
    seen = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict) and isinstance(record.get("case_id"), str):
            seen.add(record["case_id"])
    return seen


def generate_one(case: dict[str, Any], document: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    record: dict[str, Any] = {
        "case_id": case["id"], "category": case.get("category"),
        "run_label": config["run_label"], "model": config["model"],
        "guidance_mode": config["guidance_mode"], "prompt_mode": "vge_dsl_1_canonical",
        "intent": case["intent"],
        "asset_catalog": case.get("asset_catalog", []),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        raw, usage, latency = request_completion(config, make_messages(document, case, config["guidance_mode"]))
        record.update({"raw_output": raw, "usage": usage, "latency_seconds": round(latency, 3)})
        try:
            record["sample"] = parse_response(raw, intent=case["intent"], asset_catalog=case.get("asset_catalog", []))
        except Exception as error:
            record["parse_error"] = str(error)
    except Exception as error:
        record["request_error"] = str(error)
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect held-out model generations and persist each result before validation")
    parser.add_argument("--profile", choices=["qwen36_27b", "qwen35_9b", "adapter"], default="adapter")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--max-tokens", type=int, default=768, help="Maximum DSL output tokens; thinking is always disabled")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--without-guidance", action="store_true", help="Keep the shared task contract but omit the full editor guidance")
    parser.add_argument("--disable-thinking", action="store_true", default=True, help="Deprecated compatibility flag; DSL evaluation always disables thinking")
    parser.add_argument("--run-label", default="", help="Stable name stored in every record, for example adapter-guidance")
    parser.add_argument("--output-dir", type=Path, default=None, help="Existing directory resumes by case_id")
    parser.add_argument("--require-complete", action="store_true", help="Exit nonzero until every case has one persisted API response; useful for retry supervisors")
    args = parser.parse_args()
    if not 1 <= args.workers <= 12:
        parser.error("--workers must be from 1 to 12")
    config = endpoint_from_profile(args.profile, load_settings(args.env_file))
    guidance_mode = "none" if args.without_guidance else "full"
    config.update({
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "timeout": args.timeout,
        "disable_thinking": args.disable_thinking,
        "guidance_mode": guidance_mode,
        "run_label": args.run_label or f"{args.profile}-{'without-guidance' if args.without_guidance else 'guidance'}",
    })
    document = load_benchmark(args.cases)
    cases = document.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SystemExit("benchmark has no cases")
    output_dir = args.output_dir or Path("training/eval/results") / f"generations-{args.profile}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "generations.jsonl"
    completed = completed_case_ids(output)
    pending = [case for case in cases if case["id"] not in completed]
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(), "profile": args.profile,
        "model": config["model"], "cases": str(args.cases), "case_count": len(cases),
        "run_label": config["run_label"], "guidance_mode": guidance_mode,
        "prompt_mode": "vge_dsl_1_canonical", "thinking_enabled": False, "temperature": args.temperature,
        "max_tokens": args.max_tokens, "policy": "Responses are persisted before validation. API credentials are not recorded.",
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(generate_one, case, document, config) for case in pending]
        for future in concurrent.futures.as_completed(futures):
            record = future.result()
            append_record(output, record)
            print(json.dumps({"saved": record["case_id"], "request_error": record.get("request_error"), "parse_error": record.get("parse_error")}, ensure_ascii=False), flush=True)
    completed_total = len(completed_case_ids(output))
    print(json.dumps({"output_dir": str(output_dir), "completed_total": completed_total, "case_count": len(cases), "requested_this_run": len(pending)}, ensure_ascii=False))
    return 0 if not args.require_complete or completed_total == len(cases) else 2


if __name__ == "__main__":
    raise SystemExit(main())
