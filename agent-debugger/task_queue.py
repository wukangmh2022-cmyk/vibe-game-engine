#!/usr/bin/env python3
"""Persistent, lease-based curriculum queue with serialized corpus writes."""

from __future__ import annotations

import argparse
import json
import os
import queue
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT, build_command_database
from command_db import CommandDatabase
from command_synthesize import (
    DEFAULT_ENV_PATH, TeacherConfigStore, append_jsonl, collect_teacher_endpoints,
    make_jobs_from_plan, read_env_file, run_job, static_prompt,
)
from curriculum_plan import DEFAULT_PLAN_PATH, build_curriculum, load_curriculum, save_curriculum

DEBUGGER = REPO_ROOT / "agent-debugger"
RUNS_DIR = DEBUGGER / "runs" / "command-agent"
CORPUS_PATH = REPO_ROOT / "training-data" / "command-agent-sft" / "corpus.jsonl"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def db_open(path: Path) -> sqlite3.Connection:
    # Autocommit makes every controller state transition crash-durable.
    conn = sqlite3.connect(path, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.executescript("""
      CREATE TABLE IF NOT EXISTS tasks (
        plan_id TEXT PRIMARY KEY, slot_json TEXT NOT NULL,
        state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        worker_id TEXT, error TEXT, created_at TEXT NOT NULL,
        started_at TEXT, finished_at TEXT
      );
      CREATE TABLE IF NOT EXISTS workers (
        worker_id TEXT PRIMARY KEY, state TEXT NOT NULL, task_plan_id TEXT,
        endpoint_slot TEXT, model TEXT, message TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL,
        worker_id TEXT, plan_id TEXT, kind TEXT NOT NULL, message TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tasks_by_state ON tasks(state, attempts, plan_id);
    """)
    return conn


def event(conn: sqlite3.Connection, worker_id: str | None, plan_id: str | None, kind: str, message: str) -> None:
    conn.execute("INSERT INTO events(occurred_at,worker_id,plan_id,kind,message) VALUES(?,?,?,?,?)", (now(), worker_id, plan_id, kind, message[:900]))


def recover_jsonl_tail(path: Path) -> dict[str, int]:
    """Remove only a torn final JSONL record left by an abrupt process kill.

    Every accepted record is flushed and fsynced before SQLite is marked done.
    A forced kill can still land between those byte writes, leaving a partial final
    line.  Internal malformed lines are deliberately left untouched: they need
    explicit review, whereas a malformed tail is unambiguously incomplete.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(exist_ok=True)
    content = path.read_bytes()
    if not content:
        return {"truncated_bytes": 0}
    tail_start = content.rfind(b"\n", 0, len(content) - 1) + 1
    tail = content[tail_start:].strip()
    if not tail:
        return {"truncated_bytes": 0}
    try:
        json.loads(tail.decode("utf-8"))
        return {"truncated_bytes": 0}
    except (UnicodeDecodeError, json.JSONDecodeError):
        with path.open("r+b") as handle:
            handle.truncate(tail_start)
            handle.flush()
            os.fsync(handle.fileno())
        return {"truncated_bytes": len(content) - tail_start}


def corpus_plan_ids() -> set[str]:
    ids: set[str] = set()
    if not CORPUS_PATH.exists():
        return ids
    for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get("plan_id"):
            ids.add(str(item["plan_id"]))
    return ids


def migrate_legacy_corpora() -> dict[str, int]:
    """Merge historical per-run JSONL files into the one durable corpus once."""
    recovery = recover_jsonl_tail(CORPUS_PATH)
    known_plan_ids: set[str] = set()
    known_fingerprints: set[str] = set()
    for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("plan_id"):
            known_plan_ids.add(str(record["plan_id"]))
        if record.get("sample_fingerprint"):
            known_fingerprints.add(str(record["sample_fingerprint"]))
    merged = 0
    for path in sorted(CORPUS_PATH.parent.glob("*.jsonl")):
        if path == CORPUS_PATH:
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            plan_id = str(record.get("plan_id") or "")
            fingerprint = str(record.get("sample_fingerprint") or "")
            if (plan_id and plan_id in known_plan_ids) or (fingerprint and fingerprint in known_fingerprints):
                continue
            append_jsonl(CORPUS_PATH, record)
            if plan_id:
                known_plan_ids.add(plan_id)
            if fingerprint:
                known_fingerprints.add(fingerprint)
            merged += 1
    return {"merged": merged, "total": len(known_plan_ids), **recovery}


def load_plan(path: Path, rebuild: bool) -> dict[str, Any]:
    if not rebuild and path.exists():
        return load_curriculum(path)
    index_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(REPO_ROOT / "customer-demo", index_path)
    plan = build_curriculum(CommandDatabase(index_path))
    save_curriculum(plan, path)
    return plan


def enqueue(conn: sqlite3.Connection, slots: list[dict[str, Any]], retry_failed: bool) -> dict[str, int]:
    done = corpus_plan_ids()
    inserted = 0
    for slot in slots:
        plan_id = str(slot["plan_id"])
        if plan_id in done:
            conn.execute("UPDATE tasks SET state='done', worker_id=NULL, finished_at=?, error=NULL WHERE plan_id=?", (now(), plan_id))
            continue
        cursor = conn.execute(
            "INSERT OR IGNORE INTO tasks(plan_id,slot_json,state,created_at) VALUES(?,?,?,?)",
            (plan_id, json.dumps(slot, ensure_ascii=False), "queued", now()),
        )
        inserted += cursor.rowcount
    if retry_failed:
        conn.execute("UPDATE tasks SET state='queued', worker_id=NULL, error=NULL WHERE state='failed'")
    # A controller process owns all workers. Its prior running tasks must be resumed.
    conn.execute("UPDATE tasks SET state='queued', worker_id=NULL WHERE state='running'")
    event(conn, None, None, "queue_prepared", f"同步 {len(slots)} 个任务；新增 {inserted}；已有训练数据 {len(done)} 条计划槽。")
    return {"selected": len(slots), "existing_corpus": len(done), "inserted": inserted}


def snapshot(conn: sqlite3.Connection, path: Path, run_id: str, workers: int, started_at: str) -> None:
    counts = {row["state"]: row["total"] for row in conn.execute("SELECT state,COUNT(*) total FROM tasks GROUP BY state")}
    worker_rows = [dict(row) for row in conn.execute("SELECT * FROM workers ORDER BY worker_id")]
    events = [dict(row) for row in conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT 40")][::-1]
    running = sum(1 for item in worker_rows if item["state"] == "working")
    write_json(path, {
        "schema_version": 1, "status": "running" if counts.get("queued", 0) or running else "finished",
        "run_id": run_id, "started_at": started_at, "updated_at": now(),
        "output": str(CORPUS_PATH.relative_to(REPO_ROOT)), "workers_configured": workers,
        "counts": {state: counts.get(state, 0) for state in ("queued", "running", "done", "failed")},
        "workers": worker_rows, "events": events,
    })


def main() -> int:
    parser = argparse.ArgumentParser(description="Persistent worker queue for uncovered command curriculum slots")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-actions", type=int, default=8, help="Maximum teacher tool actions per task; valid local validation finishes immediately")
    parser.add_argument("--plan", default=str(DEFAULT_PLAN_PATH))
    parser.add_argument("--queue", default=str(RUNS_DIR / "task-queue.sqlite"))
    parser.add_argument("--status-file", default=str(RUNS_DIR / "task-queue-status.json"))
    parser.add_argument("--batch", type=int, action="append", default=[])
    parser.add_argument("--plan-ids", default="", help="Comma-separated plan IDs")
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--rebuild-plan", action="store_true")
    args = parser.parse_args()
    if args.workers < 1 or args.max_attempts < 1:
        parser.error("workers and max-attempts must be positive")

    migration = migrate_legacy_corpora()
    plan = load_plan(Path(args.plan), args.rebuild_plan)
    chosen_ids = {value.strip() for value in args.plan_ids.split(",") if value.strip()}
    batches = set(args.batch)
    slots = [slot for slot in plan["slots"] if (not chosen_ids or slot["plan_id"] in chosen_ids) and (not batches or slot["batch_id"] in batches)]
    if not slots:
        parser.error("no curriculum tasks matched")
    queue_path, status_path = Path(args.queue), Path(args.status_file)
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    conn = db_open(queue_path)
    info = enqueue(conn, slots, args.retry_failed)
    run_id, started_at = datetime.now().strftime("task-queue-%Y%m%d-%H%M%S"), now()
    snapshot(conn, status_path, run_id, args.workers, started_at)
    print(json.dumps({"status": "queue_prepared", **info, "legacy_corpus": migration, "queue": str(queue_path)}, ensure_ascii=False), flush=True)
    if args.prepare_only:
        conn.close()
        return 0

    env_path = Path(os.getenv("VIBE_TEACHER_ENV_FILE", str(DEFAULT_ENV_PATH)))
    env_values = {**{key: value for key, value in os.environ.items() if key.startswith("VIBE_TEACHER_")}, **read_env_file(env_path)}
    if not collect_teacher_endpoints(env_values):
        conn.close()
        parser.error("set teacher endpoints in agent-debugger/.env before starting workers")
    index_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(REPO_ROOT / "customer-demo", index_path)
    shared = {"max_tokens": int(os.getenv("VIBE_TEACHER_MAX_TOKENS", "1200")), "max_actions": args.max_actions, "temperature": 0.2, "timeout": args.timeout, "tool_protocol": os.getenv("VIBE_TEACHER_TOOL_PROTOCOL", "openai"), "api_retries": int(os.getenv("VIBE_TEACHER_API_RETRIES", "2")), "api_retry_backoff": float(os.getenv("VIBE_TEACHER_API_RETRY_BACKOFF", "1.5")), "job_wall_seconds": int(os.getenv("VIBE_TEACHER_JOB_WALL_SECONDS", "240"))}
    configs = TeacherConfigStore(env_path, shared, {})
    system, messages = static_prompt(shared["tool_protocol"]), queue.Queue()
    output_lock, fingerprint_lock = threading.Lock(), threading.Lock()
    known_fingerprints: set[str] = set()
    if CORPUS_PATH.exists():
        for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines():
            try:
                fingerprint = json.loads(line).get("sample_fingerprint")
                if fingerprint: known_fingerprints.add(str(fingerprint))
            except json.JSONDecodeError:
                pass
    CORPUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CORPUS_PATH.touch(exist_ok=True)

    def worker(worker_index: int, worker_id: str, task: dict[str, Any]) -> None:
        plan_id = task["plan_id"]
        try:
            slot = json.loads(task["slot_json"])
            job, job_id = make_jobs_from_plan([slot])[0], int(slot["slot"]) + 1
            errors: list[str] = []
            for config in configs.configs_for_failover(worker_index):
                config = dict(config)
                config["job_deadline"] = time.time() + max(60, int(config.get("job_wall_seconds") or 240))
                messages.put(("message", worker_id, plan_id, f"正在通过端点 {config.get('endpoint_slot')} 生成任务。", config))
                def on_event(item: dict[str, Any], endpoint: dict[str, Any] = config) -> None:
                    tool = item.get("tool") or "工具"
                    summary = str((item.get("observation") or {}).get("summary") or "")
                    if tool == "validate_sample" and '"valid": true' in summary:
                        text = "样本验证通过，正在本地验收并写入。"
                    elif tool in {"local_accept_after_validation", "direct_final_validation"} and '"accepted": true' in summary:
                        text = "本地验收通过，正在写入统一语料。"
                    else:
                        text = f"正在调用 {tool}，结果：{(item.get('observation') or {}).get('status', 'ok')}。"
                    messages.put(("message", worker_id, plan_id, text, endpoint))
                record, state = run_job(job_id, job, index_path, config, system, on_event=on_event)
                if record:
                    messages.put(("result", worker_id, plan_id, record, None))
                    return
                errors.append(str(state.get("error") or "endpoint failed"))
            messages.put(("result", worker_id, plan_id, None, " | ".join(errors)))
        except Exception as error:
            messages.put(("result", worker_id, plan_id, None, f"worker exception: {error}"))

    active: dict[str, threading.Thread] = {}
    available_workers = [f"worker-{index + 1:02d}" for index in range(args.workers)]
    last_snapshot = 0.0
    while True:
        # The controller is the only process that changes SQLite or corpus.jsonl.
        while available_workers:
            row = conn.execute("SELECT * FROM tasks WHERE state='queued' ORDER BY attempts,plan_id LIMIT 1").fetchone()
            if not row:
                break
            task, worker_id = dict(row), available_workers.pop(0)
            conn.execute("UPDATE tasks SET state='running',attempts=attempts+1,worker_id=?,started_at=?,error=NULL WHERE plan_id=?", (worker_id, now(), task["plan_id"]))
            conn.execute("INSERT INTO workers(worker_id,state,task_plan_id,message,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET state=excluded.state,task_plan_id=excluded.task_plan_id,message=excluded.message,updated_at=excluded.updated_at", (worker_id, "working", task["plan_id"], "领取任务，正在准备生成。", now()))
            event(conn, worker_id, task["plan_id"], "claimed", "领取任务。")
            worker_index = int(worker_id.rsplit("-", 1)[1]) - 1
            thread = threading.Thread(target=worker, args=(worker_index, worker_id, task), daemon=True)
            active[worker_id] = thread
            thread.start()
        try:
            kind, worker_id, plan_id, data, extra = messages.get(timeout=0.25)
            if kind == "message":
                endpoint = extra or {}
                conn.execute("UPDATE workers SET message=?,endpoint_slot=?,model=?,updated_at=? WHERE worker_id=?", (data[:900], endpoint.get("endpoint_slot"), endpoint.get("model"), now(), worker_id))
                event(conn, worker_id, plan_id, "progress", data)
            else:
                thread = active.pop(worker_id, None)
                if thread: thread.join(timeout=1)
                available_workers.append(worker_id)
                available_workers.sort()
                if data:
                    fingerprint = str(data.get("sample_fingerprint") or "")
                    with fingerprint_lock:
                        duplicate = bool(fingerprint and fingerprint in known_fingerprints)
                        if not duplicate and fingerprint: known_fingerprints.add(fingerprint)
                    if not duplicate:
                        with output_lock: append_jsonl(CORPUS_PATH, data)
                        conn.execute("UPDATE tasks SET state='done',worker_id=NULL,finished_at=?,error=NULL WHERE plan_id=?", (now(), plan_id))
                        message, kind_name = "任务完成，已写入 corpus.jsonl。", "completed"
                    else:
                        data, extra = None, f"duplicate sample fingerprint: {fingerprint}"
                if not data:
                    attempts = conn.execute("SELECT attempts FROM tasks WHERE plan_id=?", (plan_id,)).fetchone()["attempts"]
                    retry = attempts < args.max_attempts
                    conn.execute("UPDATE tasks SET state=?,worker_id=NULL,error=?,finished_at=? WHERE plan_id=?", ("queued" if retry else "failed", extra[:1200], now() if not retry else None, plan_id))
                    message, kind_name = (f"本次失败，已重新入队 ({attempts}/{args.max_attempts})。" if retry else f"失败次数达到上限 ({attempts}/{args.max_attempts})。"), ("requeued" if retry else "failed")
                conn.execute("UPDATE workers SET state='idle',task_plan_id=NULL,message=?,updated_at=? WHERE worker_id=?", (message, now(), worker_id))
                event(conn, worker_id, plan_id, kind_name, message if data else extra)
        except queue.Empty:
            pass
        if time.monotonic() - last_snapshot > 1:
            snapshot(conn, status_path, run_id, args.workers, started_at)
            last_snapshot = time.monotonic()
        queued = conn.execute("SELECT COUNT(*) FROM tasks WHERE state='queued'").fetchone()[0]
        if not active and not queued:
            break
    snapshot(conn, status_path, run_id, args.workers, started_at)
    conn.close()
    print(json.dumps({"status": "finished", "output": str(CORPUS_PATH.relative_to(REPO_ROOT)), "status_file": str(status_path)}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
