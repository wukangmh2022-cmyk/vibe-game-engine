#!/usr/bin/env python3
"""Interactive, fail-closed trajectory distillation controller."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEBUGGER = ROOT / "agent-debugger"
PROGRESS_PATH = DEBUGGER / "progress.json"
PROMPT_TEMPLATE = DEBUGGER / "prompts" / "data-synthesis.md"
CATEGORIES = ["create", "modify", "interaction", "state_logic", "scene_flow", "repair", "resource_layout", "validation"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise RuntimeError(f"progress file not found: {path}. Run init first.") from None
    except json.JSONDecodeError as error:
        raise RuntimeError(f"invalid JSON in {path}: {error}") from error
    if not isinstance(value, dict):
        raise RuntimeError("progress root must be a JSON object")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def git_head(project_root: Path) -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=project_root, text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def episode(progress: dict[str, Any], episode_id: str | None) -> dict[str, Any] | None:
    if not episode_id:
        return None
    return next((item for item in progress.get("episodes", []) if item.get("episode_id") == episode_id), None)


def next_focus(progress: dict[str, Any]) -> str:
    successful = [item for item in progress.get("episodes", []) if item.get("status") == "success"]
    requested = successful[-1].get("next_focus") if successful else None
    if requested in CATEGORIES:
        return requested
    return CATEGORIES[len(successful) % len(CATEGORIES)]


def issue_episode(progress: dict[str, Any], progress_path: Path) -> dict[str, Any]:
    active = episode(progress, progress.get("active_episode_id"))
    if active and active.get("status") in {"issued", "running"}:
        return active

    number = int(progress.get("next_episode_number", 1))
    episode_id = f"ep-{number:04d}"
    run_dir = DEBUGGER / "runs" / episode_id
    run_dir.mkdir(parents=True, exist_ok=True)
    item = {
        "episode_id": episode_id,
        "status": "issued",
        "focus": next_focus(progress),
        "base_commit": git_head(Path(progress["project_root"])),
        "issued_at": now(),
        "prompt": str(run_dir.relative_to(ROOT) / "prompt.md"),
    }
    progress.setdefault("episodes", []).append(item)
    progress["active_episode_id"] = episode_id
    progress["next_episode_number"] = number + 1
    write_json(progress_path, progress)

    context = {
        "episode_id": episode_id,
        "focus": item["focus"],
        "base_commit": item["base_commit"],
        "project_root": progress["project_root"],
        "teacher": progress["teacher"],
        "progress_file": str(progress_path.relative_to(ROOT)),
    }
    prompt = PROMPT_TEMPLATE.read_text(encoding="utf-8")
    prompt = prompt.replace("{{EPISODE_ID}}", episode_id)
    prompt = prompt.replace("{{EPISODE_CONTEXT}}", json.dumps(context, ensure_ascii=False, indent=2))
    (run_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    return item


def settle_active_episode(progress: dict[str, Any], progress_path: Path) -> None:
    active = episode(progress, progress.get("active_episode_id"))
    if not active:
        return
    status = active.get("status")
    if status == "failed":
        raise RuntimeError(f"active {active['episode_id']} failed: {active.get('error', 'no error supplied')}")
    if status in {"issued", "running"}:
        raise RuntimeError(f"active {active['episode_id']} is still {status}; complete it or mark it failed in progress.json")
    if status != "success":
        raise RuntimeError(f"active {active['episode_id']} has invalid status: {status}")
    errors = validate_success(Path(progress["project_root"]).resolve(), active)
    if errors:
        raise RuntimeError("active success output is invalid:\n- " + "\n- ".join(errors))
    progress["active_episode_id"] = None
    active["controller_validated_at"] = now()
    write_json(progress_path, progress)
    print(f"UNLOCKED: resumed and accepted {active['episode_id']}")


def validate_success(project_root: Path, item: dict[str, Any]) -> list[str]:
    result = item.get("result") if isinstance(item.get("result"), dict) else {}
    jsonl = project_root / str(result.get("jsonl", ""))
    manifest = project_root / str(result.get("manifest", ""))
    errors: list[str] = []
    if not jsonl.is_file():
        errors.append(f"missing JSONL: {jsonl}")
    if not manifest.is_file():
        errors.append(f"missing manifest: {manifest}")
    records: list[dict[str, Any]] = []
    if jsonl.is_file():
        for line_number, line in enumerate(jsonl.read_text(encoding="utf-8").splitlines(), 1):
            try:
                record = json.loads(line)
                if not isinstance(record, dict):
                    raise ValueError("record is not an object")
                records.append(record)
            except Exception as error:
                errors.append(f"invalid JSONL line {line_number}: {error}")
    if len(records) != 10:
        errors.append(f"expected 10 JSONL records, found {len(records)}")
    if any(record.get("status") != "accepted" for record in records):
        errors.append("all JSONL records must have status=accepted")
    if result.get("accepted_count") != 10:
        errors.append("progress result.accepted_count must equal 10")
    if manifest.is_file():
        try:
            value = json.loads(manifest.read_text(encoding="utf-8"))
            if value.get("accepted_count") != 10:
                errors.append("manifest accepted_count must equal 10")
        except Exception as error:
            errors.append(f"invalid manifest: {error}")
    return errors


def launch_runner(runner: str, prompt_path: Path, project_root: Path) -> None:
    if runner == "manual":
        return
    text = prompt_path.read_text(encoding="utf-8")
    commands = {
        "claude": ["claude", "-p", text],
        "opencode": ["opencode", "run", text],
    }
    command = commands.get(runner)
    if not command:
        raise RuntimeError(f"unsupported runner: {runner}")
    if not shutil.which(command[0]):
        raise RuntimeError(f"runner executable not found: {command[0]}; use manual mode or install it")
    subprocess.run(command, cwd=project_root, check=False)


def command_init(args: argparse.Namespace) -> int:
    if PROGRESS_PATH.exists() and not args.force:
        raise RuntimeError(f"{PROGRESS_PATH} already exists; use --force to replace it")
    api_base = args.api_base or input("Teacher API base (optional): ").strip()
    model = args.model or input("Teacher model name: ").strip()
    runner = args.runner or input("Runner [manual/claude/opencode] (manual): ").strip() or "manual"
    if runner not in {"manual", "claude", "opencode"}:
        raise RuntimeError("runner must be manual, claude, or opencode")
    write_json(PROGRESS_PATH, {
        "schema_version": "v1",
        "project_root": str(ROOT),
        "teacher": {"api_base": api_base, "model": model, "runner": runner},
        "next_episode_number": 1,
        "active_episode_id": None,
        "episodes": [],
    })
    print(f"created {PROGRESS_PATH}")
    return 0


def command_status(_: argparse.Namespace) -> int:
    progress = read_json(PROGRESS_PATH)
    print(json.dumps({
        "teacher": progress.get("teacher"),
        "active_episode_id": progress.get("active_episode_id"),
        "episodes": [{key: item.get(key) for key in ("episode_id", "status", "focus", "summary", "error")} for item in progress.get("episodes", [])],
    }, ensure_ascii=False, indent=2))
    return 0


def command_debug(args: argparse.Namespace) -> int:
    command = [sys.executable, str(DEBUGGER / "debug_project.py"), "--project", args.project]
    if args.output:
        command.extend(["--output", args.output])
    return subprocess.run(command, cwd=ROOT, check=False).returncode


def command_run(args: argparse.Namespace) -> int:
    for _ in range(args.rounds):
        progress = read_json(PROGRESS_PATH)
        settle_active_episode(progress, PROGRESS_PATH)
        project_root = Path(progress["project_root"]).resolve()
        item = issue_episode(progress, PROGRESS_PATH)
        prompt_path = ROOT / item["prompt"]
        print(f"\nEpisode {item['episode_id']} issued. Focus: {item['focus']}")
        print(f"Prompt: {prompt_path}")
        try:
            launch_runner(args.runner or progress["teacher"]["runner"], prompt_path, project_root)
        except RuntimeError as error:
            print(f"runner error: {error}", file=sys.stderr)
            return 1
        input("Paste the prompt to the coding agent, wait for completion, then press Enter: ")

        progress = read_json(PROGRESS_PATH)
        updated = episode(progress, item["episode_id"])
        if not updated:
            print("STOP: active episode was removed from progress.json", file=sys.stderr)
            return 1
        status = updated.get("status")
        if status == "failed":
            print(f"STOP: {item['episode_id']} failed: {updated.get('error', 'no error supplied')}", file=sys.stderr)
            return 1
        if status != "success":
            print(f"STOP: {item['episode_id']} must be marked success or failed in progress.json", file=sys.stderr)
            return 1
        errors = validate_success(project_root, updated)
        if errors:
            print("STOP: success output validation failed:\n- " + "\n- ".join(errors), file=sys.stderr)
            return 1
        progress["active_episode_id"] = None
        updated["controller_validated_at"] = now()
        write_json(PROGRESS_PATH, progress)
        print(f"UNLOCKED: {item['episode_id']} accepted. Preparing next episode.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Interactive Vibe trajectory distillation controller")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init", help="Create local progress.json")
    init.add_argument("--api-base")
    init.add_argument("--model")
    init.add_argument("--runner", choices=["manual", "claude", "opencode"])
    init.add_argument("--force", action="store_true")
    init.set_defaults(func=command_init)

    status = subparsers.add_parser("status", help="Show current episode state")
    status.set_defaults(func=command_status)

    debug = subparsers.add_parser("debug", help="Build a compact project resource and scene index")
    debug.add_argument("--project", default=str(ROOT / "customer-demo"))
    debug.add_argument("--output")
    debug.set_defaults(func=command_debug)

    run = subparsers.add_parser("run", help="Issue and verify one or more interactive episodes")
    run.add_argument("--rounds", type=int, default=1)
    run.add_argument("--runner", choices=["manual", "claude", "opencode"])
    run.set_defaults(func=command_run)

    args = parser.parse_args()
    try:
        return args.func(args)
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
