#!/usr/bin/env python3
"""Overnight driver for curriculum command synthesis.

Keeps filling the 1000-slot curriculum across batches:
1) finish remaining slots for the current batch
2) move to later batches
3) periodically retry still-missing slots with multi-endpoint failover
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from command_synthesize import DEFAULT_ENV_PATH, collect_teacher_endpoints, read_env_file
from curriculum_plan import DEFAULT_PLAN_PATH, build_curriculum, load_curriculum, save_curriculum

DEBUGGER = REPO_ROOT / "agent-debugger"
CORPUS_DIR = REPO_ROOT / "training-data" / "command-agent-sft"
RUNS_DIR = DEBUGGER / "runs" / "command-agent"
STATUS_PATH = RUNS_DIR / "overnight-status.json"
LOG_PATH = RUNS_DIR / "overnight.log"


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def log(msg: str) -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    line = f"[{now()}] {msg}"
    print(line, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def write_status(data: dict[str, Any]) -> None:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_plan(plan_path: Path, rebuild: bool = False) -> dict[str, Any]:
    if rebuild or not plan_path.exists():
        from command_db import CommandDatabase
        from build_command_db import build_command_database

        database_path = DEBUGGER / "state" / "command-index.sqlite"
        build_command_database(REPO_ROOT / "customer-demo", database_path)
        plan = build_curriculum(CommandDatabase(database_path))
        save_curriculum(plan, plan_path)
        return plan
    return load_curriculum(plan_path)


def covered_plan_ids(corpus_dir: Path) -> set[str]:
    covered: set[str] = set()
    if not corpus_dir.exists():
        return covered
    for path in corpus_dir.glob("*.jsonl"):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for line in text.splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            plan_id = record.get("plan_id")
            if plan_id:
                covered.add(str(plan_id))
    return covered


def batch_missing(plan: dict[str, Any], batch_id: int, covered: set[str]) -> list[str]:
    ids = [slot["plan_id"] for slot in plan["slots"] if slot.get("batch_id") == batch_id]
    return [plan_id for plan_id in ids if plan_id not in covered]


def coverage_snapshot(plan: dict[str, Any], covered: set[str]) -> dict[str, Any]:
    batches = {}
    total = 0
    total_covered = 0
    for batch_id in range(10):
        ids = [slot["plan_id"] for slot in plan["slots"] if slot.get("batch_id") == batch_id]
        if not ids:
            continue
        miss = [plan_id for plan_id in ids if plan_id not in covered]
        batches[str(batch_id)] = {
            "covered": len(ids) - len(miss),
            "total": len(ids),
            "missing": miss,
        }
        total += len(ids)
        total_covered += len(ids) - len(miss)
    return {"covered": total_covered, "total": total, "batches": batches}


def endpoint_summary(env_path: Path) -> list[dict[str, str]]:
    values = {**{k: v for k, v in os.environ.items() if k.startswith("VIBE_TEACHER_")}, **read_env_file(env_path)}
    endpoints = collect_teacher_endpoints(values)
    return [{"slot": item["slot"], "api_base": item["api_base"], "model": item["model"]} for item in endpoints]


def write_retry_file(plan_ids: list[str], label: str) -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"overnight-retry-{label}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    path.write_text(json.dumps({
        "run_id": f"overnight-{label}",
        "failed_plan_ids": plan_ids,
        "failed_plan_ids_resolved": plan_ids,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def run_synthesize(cmd: list[str], cwd: Path, idle_kill_seconds: int = 600) -> int:
    """Run synthesis; if stdout/process stalls for too long, kill and continue overnight loop."""
    import select

    log("exec: " + " ".join(cmd))
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    last_output = time.time()
    stdout_fd = proc.stdout.fileno()
    while True:
        ready, _, _ = select.select([stdout_fd], [], [], 1.0)
        if ready:
            line = proc.stdout.readline()
            if line:
                last_output = time.time()
                sys.stdout.write(line)
                sys.stdout.flush()
                with LOG_PATH.open("a", encoding="utf-8") as handle:
                    handle.write(line)
                continue
            # EOF-ish empty read; check process
        code = proc.poll()
        if code is not None:
            rest = proc.stdout.read() or ""
            if rest:
                sys.stdout.write(rest)
                sys.stdout.flush()
                with LOG_PATH.open("a", encoding="utf-8") as handle:
                    handle.write(rest)
            return code
        if time.time() - last_output > idle_kill_seconds:
            log(f"synth stalled {idle_kill_seconds}s without output; killing pid={proc.pid}")
            try:
                proc.kill()
            except OSError:
                pass
            try:
                return proc.wait(timeout=30)
            except Exception:
                return 124


def main() -> int:
    parser = argparse.ArgumentParser(description="Overnight multi-batch command synthesis driver")
    parser.add_argument("--start-batch", type=int, default=0)
    parser.add_argument("--end-batch", type=int, default=9)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--max-rounds", type=int, default=30, help="Max full passes over remaining work")
    parser.add_argument("--target-accepted", type=int, default=300, help="Stop early after this many total accepted samples exist")
    parser.add_argument("--max-hours", type=float, default=10.0)
    parser.add_argument("--sleep-seconds", type=int, default=15)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-actions", type=int, default=20)
    parser.add_argument("--rebuild-plan", action="store_true")
    parser.add_argument("--plan", default=str(DEFAULT_PLAN_PATH))
    args = parser.parse_args()

    plan_path = Path(args.plan)
    env_path = Path(os.getenv("VIBE_TEACHER_ENV_FILE", str(DEFAULT_ENV_PATH)))
    started = time.time()
    plan = load_plan(plan_path, rebuild=args.rebuild_plan)
    covered = covered_plan_ids(CORPUS_DIR)
    snap = coverage_snapshot(plan, covered)
    log(f"overnight start covered={snap['covered']}/{snap['total']} endpoints={endpoint_summary(env_path)}")
    write_status({
        "status": "running",
        "started_at": now(),
        "coverage": snap,
        "endpoints": endpoint_summary(env_path),
        "last_action": "boot",
    })

    # Prefer finishing earlier batches first.
    for round_idx in range(1, args.max_rounds + 1):
        elapsed_h = (time.time() - started) / 3600.0
        covered = covered_plan_ids(CORPUS_DIR)
        snap = coverage_snapshot(plan, covered)
        if snap["covered"] >= args.target_accepted:
            log(f"target accepted reached: {snap['covered']} >= {args.target_accepted}")
            break
        if elapsed_h >= args.max_hours:
            log(f"max hours reached: {elapsed_h:.2f}h")
            break

        made_progress = False
        # Speed strategy: first fill empty full batches (high yield), only then chip hard residuals.
        # Residual retries every round burn a lot of wall time on a few bad slots.
        work_items: list[tuple[str, int, list[str]]] = []
        covered_now = covered_plan_ids(CORPUS_DIR)
        full_items: list[tuple[str, int, list[str]]] = []
        residual_items: list[tuple[str, int, list[str]]] = []
        for batch_id in range(args.start_batch, args.end_batch + 1):
            missing = batch_missing(plan, batch_id, covered_now)
            if not missing:
                continue
            batch_slots = [slot["plan_id"] for slot in plan["slots"] if slot.get("batch_id") == batch_id]
            if len(missing) == len(batch_slots):
                full_items.append(("full", batch_id, missing))
            else:
                residual_items.append(("retry", batch_id, missing))
        # In early rounds, only touch residuals if they are large; tiny hard tails wait until full batches are done.
        if full_items:
            work_items = full_items
            # Optionally include large residual batches that still have lots of easy yield.
            for kind, batch_id, missing in residual_items:
                if len(missing) >= 40:
                    work_items.append((kind, batch_id, missing))
        else:
            work_items = residual_items

        for kind, batch_id, missing in work_items:
            elapsed_h = (time.time() - started) / 3600.0
            if elapsed_h >= args.max_hours:
                break
            covered = covered_plan_ids(CORPUS_DIR)
            # Recompute missing so concurrent corpus growth is respected.
            missing = batch_missing(plan, batch_id, covered)
            if not missing:
                continue

            batch_slots = [slot["plan_id"] for slot in plan["slots"] if slot.get("batch_id") == batch_id]
            if kind == "full" or len(missing) == len(batch_slots):
                cmd = [
                    sys.executable, "-u", str(DEBUGGER / "command_synthesize.py"),
                    "--samples", str(min(args.batch_size, len(missing))),
                    "--plan-offset", str(batch_id * args.batch_size),
                    "--max-actions", str(args.max_actions),
                    "--timeout", str(args.timeout),
                ]
                action = f"batch{batch_id}-full"
            else:
                # Cap residual retries per round so a few toxic slots cannot dominate the night.
                retry_budget = min(len(missing), max(8, args.batch_size // 4))
                retry_ids = missing[:retry_budget]
                retry_path = write_retry_file(retry_ids, f"batch{batch_id}-r{round_idx}")
                cmd = [
                    sys.executable, "-u", str(DEBUGGER / "command_synthesize.py"),
                    "--retry-failed", str(retry_path),
                    "--max-actions", str(args.max_actions),
                    "--timeout", str(args.timeout),
                ]
                action = f"batch{batch_id}-retry-{len(retry_ids)}"

            before = len(covered_plan_ids(CORPUS_DIR))
            write_status({
                "status": "running",
                "started_at": datetime.fromtimestamp(started).isoformat(timespec="seconds"),
                "round": round_idx,
                "last_action": action,
                "coverage": coverage_snapshot(plan, covered_plan_ids(CORPUS_DIR)),
                "endpoints": endpoint_summary(env_path),
                "updated_at": now(),
            })
            log(f"round={round_idx} action={action} missing={len(missing)}")
            code = run_synthesize(cmd, REPO_ROOT)
            after_covered = covered_plan_ids(CORPUS_DIR)
            after = len(after_covered)
            gained = after - before
            made_progress = made_progress or gained > 0
            snap = coverage_snapshot(plan, after_covered)
            log(f"round={round_idx} action={action} exit={code} gained={gained} covered={snap['covered']}/{snap['total']}")
            write_status({
                "status": "running",
                "started_at": datetime.fromtimestamp(started).isoformat(timespec="seconds"),
                "round": round_idx,
                "last_action": action,
                "last_exit_code": code,
                "last_gained": gained,
                "coverage": snap,
                "endpoints": endpoint_summary(env_path),
                "updated_at": now(),
            })
            if snap["covered"] >= args.target_accepted:
                break
            time.sleep(max(1, args.sleep_seconds))

        covered = covered_plan_ids(CORPUS_DIR)
        remaining = []
        for batch_id in range(args.start_batch, args.end_batch + 1):
            remaining.extend(batch_missing(plan, batch_id, covered))
        if not remaining:
            log("all selected batches complete")
            break
        if not made_progress:
            log(f"no progress in round {round_idx}; cooling down before retry")
            time.sleep(max(5, args.sleep_seconds * 2))

    covered = covered_plan_ids(CORPUS_DIR)
    snap = coverage_snapshot(plan, covered)
    write_status({
        "status": "finished",
        "started_at": datetime.fromtimestamp(started).isoformat(timespec="seconds"),
        "finished_at": now(),
        "elapsed_hours": round((time.time() - started) / 3600.0, 3),
        "coverage": snap,
        "endpoints": endpoint_summary(env_path),
    })
    log(f"overnight finished covered={snap['covered']}/{snap['total']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
