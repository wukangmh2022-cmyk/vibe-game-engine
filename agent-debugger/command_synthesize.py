#!/usr/bin/env python3
"""Fast parallel synthesis of instruction-to-command SFT samples.

The source repository is read-only. Workers only read a compact SQLite command
index, call an OpenAI-compatible teacher API, and write generated JSONL data.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import threading
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from command_db import CommandDatabase, build_command_database, resource_refs
from command_validator import CommandSampleValidator

DEBUGGER = REPO_ROOT / "agent-debugger"
MOTIF_TYPES = {
    "SHOW_IMAGE", "SHOW_CHOICES", "SET_CLICKABLE", "SET_DRAGGABLE",
    "CREATE_DROP_ZONE", "CHECK_IN_AREA", "FLIP_CARD", "SET_VARIABLE",
    "IF_CONDITION", "SCENE_REDIRECT", "NEXT_LEVEL", "UPDATE_TEXT",
}


def strip_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def call_teacher(config: dict[str, Any], messages: list[dict[str, str]]) -> str:
    endpoint = config["api_base"].rstrip("/") + "/chat/completions"
    payload = json.dumps({
        "model": config["model"],
        "messages": messages,
        "temperature": config["temperature"],
        "max_tokens": config["max_tokens"],
    }).encode("utf-8")
    request = urllib.request.Request(endpoint, data=payload, method="POST", headers={"Content-Type": "application/json"})
    if config["api_key"]:
        request.add_header("Authorization", f"Bearer {config['api_key']}")
    try:
        with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"teacher API HTTP {error.code}: {error.read().decode('utf-8', errors='replace')[-800:]}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"teacher API connection failed: {error.reason}") from error
    try:
        return result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError(f"unexpected teacher response: {str(result)[:800]}") from error


def static_prompt() -> str:
    return "\n\n".join([
        (DEBUGGER / "prompts" / "command-synthesis.md").read_text(encoding="utf-8"),
        "Authoritative instruction references: level-editor/src/guides/promptGuideInline.ts; level-editor/src/utils/commandTemplates.ts; src/commands/factory.ts. Use the supplied indexed examples as the immediate syntax reference.",
    ])


def make_jobs(database: CommandDatabase, samples: int | None, per_command: int | None) -> list[dict[str, Any]]:
    command_types = [item["command_type"] for item in database.stats()["command_types"]]
    def job(command_type: str, variant: int) -> dict[str, Any]:
        mode = "motif" if command_type in MOTIF_TYPES and variant % 4 != 0 else "atomic"
        return {"command_type": command_type, "variant": variant, "sample_mode": mode}
    if per_command is not None:
        return [job(command_type, variant) for command_type in command_types for variant in range(per_command)]
    assert samples is not None
    return [job(command_types[index % len(command_types)], index // len(command_types)) for index in range(samples)]


def run_job(job_id: int, job: dict[str, Any], database_path: Path, config: dict[str, Any], system: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    database = CommandDatabase(database_path)
    validator = CommandSampleValidator(database)
    examples = database.find_commands(job["command_type"], limit=3)
    allowed_existing_assets = {
        resource_id
        for example in examples
        for _, resource_id in resource_refs(example["command"].get("parameters", {}))
    }
    context = database.command_context(examples[0]["command_key"], 3, 3) if job["sample_mode"] == "motif" and examples else None
    user = {
        "assigned_primary_command_type": job["command_type"],
        "variant_number": job["variant"],
        "sample_mode": job["sample_mode"],
        "reference_examples": examples,
        "local_command_context": context,
        "instruction": "Generate one new non-duplicate instruction mapping sample now.",
    }
    last_error = ""
    for attempt in range(config["retries"] + 1):
        try:
            sample = strip_json(call_teacher(config, [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]))
            validation = validator.validate(
                sample,
                job["command_type"],
                2 if job["sample_mode"] == "motif" else 1,
                allowed_existing_assets,
            )
            if validation["valid"]:
                record = {
                    "schema_version": "command-sft-v1",
                    "sample_id": f"cmd-{job_id:05d}",
                    "primary_command_type": job["command_type"],
                    "sample_mode": job["sample_mode"],
                    "input": {"intent": sample["intent"], "asset_catalog": sample.get("asset_catalog", [])},
                    "output": {"commands": sample["commands"]},
                    "source_examples": [example["command_key"] for example in examples],
                    "validation": validation,
                }
                return record, {"sample_id": record["sample_id"], "status": "success", "attempt": attempt + 1}
            last_error = "; ".join(validation["errors"])
        except Exception as error:
            last_error = str(error)
        user["previous_error"] = last_error
        user["instruction"] = "Correct the previous output. Return one JSON object that passes the stated schema and command validation."
    return None, {"sample_id": f"cmd-{job_id:05d}", "status": "failed", "error": last_error}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Parallel Vibe command-mapping synthesis")
    sample_group = parser.add_mutually_exclusive_group(required=True)
    sample_group.add_argument("--samples", type=int, help="Total samples, distributed across command types")
    sample_group.add_argument("--per-command", type=int, help="Samples for every indexed command type")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--project", default=str(REPO_ROOT / "customer-demo"))
    parser.add_argument("--api-base", default=os.getenv("VIBE_TEACHER_API_BASE", ""))
    parser.add_argument("--api-key", default=os.getenv("VIBE_TEACHER_API_KEY", ""))
    parser.add_argument("--model", default=os.getenv("VIBE_TEACHER_MODEL", ""))
    parser.add_argument("--max-tokens", type=int, default=int(os.getenv("VIBE_TEACHER_MAX_TOKENS", "1200")))
    parser.add_argument("--temperature", type=float, default=0.35)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.workers < 1 or (args.samples is not None and args.samples < 1) or (args.per_command is not None and args.per_command < 1):
        parser.error("workers and sample counts must be positive")
    if not args.dry_run and (not args.api_base or not args.model):
        parser.error("set API/model through arguments or VIBE_TEACHER_API_BASE/VIBE_TEACHER_MODEL")

    database_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(Path(args.project), database_path)
    database = CommandDatabase(database_path)
    jobs = make_jobs(database, args.samples, args.per_command)
    run_id = datetime.now().strftime("command-%Y%m%d-%H%M%S")
    run_dir = DEBUGGER / "runs" / "command" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    if args.dry_run:
        write_json(run_dir / "manifest.json", {"run_id": run_id, "status": "dry_run", "workers": args.workers, "job_count": len(jobs), "jobs": jobs})
        print(json.dumps({"run_dir": str(run_dir), "status": "dry_run", "job_count": len(jobs), "workers": args.workers}, ensure_ascii=False))
        return 0

    config = {key: getattr(args, key) for key in ("api_base", "api_key", "model", "max_tokens", "temperature", "timeout", "retries")}
    system = static_prompt()
    stop = threading.Event()
    records: list[dict[str, Any]] = []
    states: list[dict[str, Any]] = []
    lock = threading.Lock()

    def worker(worker_id: int, indexed_jobs: list[tuple[int, dict[str, Any]]]) -> None:
        local_states: list[dict[str, Any]] = []
        for job_id, job in indexed_jobs:
            if stop.is_set():
                break
            record, state = run_job(job_id, job, database_path, config, system)
            local_states.append(state)
            write_json(run_dir / f"worker-{worker_id:02d}.json", {"worker_id": worker_id, "updated_at": datetime.now().isoformat(), "samples": local_states})
            with lock:
                states.append(state)
                if record:
                    records.append(record)

    buckets = [list(enumerate(jobs, 1))[index::args.workers] for index in range(args.workers)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(worker, index, bucket) for index, bucket in enumerate(buckets)]
        for future in futures:
            future.result()

    records.sort(key=lambda item: item["sample_id"])
    output = REPO_ROOT / "training-data" / "command-sft" / f"{run_id}.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    manifest = {
        "run_id": run_id,
        "workers": args.workers,
        "requested_samples": len(jobs),
        "accepted_samples": len(records),
        "failed_samples": len([state for state in states if state["status"] == "failed"]),
        "output": str(output.relative_to(REPO_ROOT)),
        "states": states,
    }
    write_json(run_dir / "manifest.json", manifest)
    print(json.dumps({"run_dir": str(run_dir), **{key: manifest[key] for key in ("requested_samples", "accepted_samples", "failed_samples", "output")}}, ensure_ascii=False))
    return 0 if manifest["accepted_samples"] == manifest["requested_samples"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
