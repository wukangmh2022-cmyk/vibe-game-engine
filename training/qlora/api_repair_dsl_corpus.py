#!/usr/bin/env python3
"""Use a configured ENV slot to review and repair VGE-DSL training rows.

The script is intentionally versioned-output only: it does not overwrite the
current dataset or repair ledger. It writes an API repair workspace that can be
used as the extra repair ledger for a next dataset version.
"""

from __future__ import annotations

import argparse
import collections
import concurrent.futures
import hashlib
import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEBUGGER = ROOT / "agent-debugger"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(DEBUGGER) not in sys.path:
    sys.path.insert(0, str(DEBUGGER))

from command_synthesize import call_teacher, collect_teacher_endpoints, read_env_file
from training.dsl.level_dsl import compile_patch, normalize_for_comparison, parse_program, serialize_patch
from training.qlora.validate_dsl_corpus import audit_row


DEFAULT_ENV_FILE = DEBUGGER / ".env"
DEFAULT_DATA_DIR = ROOT / "training/qlora/data/level-authoring-dsl-v2"
DEFAULT_OUTPUT_DIR = ROOT / "training-data/dsl-v3-api-repair"
DEFAULT_CURRENT_REPAIRS = ROOT / "training-data/dsl-v2-quality-repairs.jsonl"
DEFAULT_REVIEW_RESULTS = DEFAULT_DATA_DIR / "manual_review/review_results.json"


REPAIR_SYSTEM = """你是 VGE-DSL/1 训练数据修复员。你的任务不是泛泛打分，而是逐条阅读 TASK、ASSETS、当前 DSL、本地检查和人工批注，判断这条样本是否适合作为 SFT gold；如果不适合，必须修成更好的训练样本。

你必须只输出一个 JSON 对象，不输出 Markdown、解释文本或思考过程。

核心质量标准：
1. TASK、ASSETS、DSL 必须语义一致。用户要求的关键行为必须在 DSL 中真的发生；DSL 做的关键行为也必须能从 TASK 中读出来。
2. Runtime 通过只是下限，不代表语义好。不要用静态可执行掩盖意图缺失。
3. 不要让 TASK 像解析器中文直译。禁止“更新变量：...”“按表达式判断：getVar(...)”“LOOP。满足条件时跳出循环”等日志式表述。改成自然工程说明，例如“把 score 加 1；如果 score 大于等于 3，就进入下一关”。
4. 能用普通 IF 表达的条件，不要用 IFEXPR getVar。只有普通 IF 无法表达时才保留 IFEXPR。
5. 如果 TASK 说答题、答对、答错、分类、选择、匹配、得分、连击、通关，DSL 至少要有可见题面/说明、选项或可点击元素、状态变化、必要的反馈。不能只显示胜利/失败图就声称“答对/答错后”。
6. 如果 TASK 只是单步音效、等待、变量更新，不要包装成完整玩法。短 DSL 可以，但 TASK 要窄。
7. “选择”通常需要 CHOICES/OPTION/SELECT/CLICK 等真实交互；如果只是说明文字，就 TASK 必须明确它只是说明文字。
8. 内置动画预设和资源动画必须分清：ANIM_IN/LOOP/OUT 的 fade/scaleIn/bounce/moveIn/hoverY/pulse/scaleOut/moveOut 是引擎内置预设，无需 ASSETS；TASK 要写“内置淡入/内置放大入场/内置弹跳入场/内置脉冲循环”等。ASSETS 中 type=animation 的中文 ID 只能通过 IMAGE animation 或明确接受资产动画的参数引用。
9. SELECT effect=pulse 是内置脉冲选中反馈，TASK 应说明“内置脉冲选中反馈”。
10. 需要可见动画时，不要只用瞬时 STYLE 冒充。应有 WAIT/MOVE/ANIM_* 或将 TASK 收窄为即时样式调整。
11. BGM/SE 资源 ID 要语义明确。避免新修复数据里继续用泛 id `bgm`；用 bgm_project/bgm_quiz/bgm_tutorial 或文件名派生 ID，并保持 TASK/ASSETS/DSL 三处一致。音量用“最大音量/70%音量/低音量”等自然说法，不写“以 1 音量”。
12. 不要发明无意义 SIGNAL。SIGNAL 要么本地 ON 消费，要么 TASK 明确说它是外部 runtime signal。
13. 不要绕开用户意图。可以修改 TASK、ASSETS、DSL，但必须让三者共同表达一个高质量、真实可学的样本。

返回 JSON schema：
{
  "verdict": "KEEP" | "FIX" | "EXCLUDE",
  "confidence": 0.0到1.0,
  "issue_types": ["QUERY_TOO_CODELIKE" | "QUERY_TOO_BROAD" | "MISSING_INTERACTION" | "MISSING_FEEDBACK" | "MISSING_TEMPORAL_EFFECT" | "BUILTIN_ANIMATION_NOT_DECLARED" | "RESOURCE_ID_MISMATCH" | "GENERIC_RESOURCE_ID" | "BAD_VOLUME_WORDING" | "MEANINGLESS_SIGNAL" | "OTHER"],
  "repaired_intent": "KEEP 时可等于原 TASK；FIX 时必须是修复后的 TASK；EXCLUDE 时可为空",
  "repaired_asset_catalog": [{"id":"...", "type":"image|audio|animation|skin|...", "path":"...", "origin":"...", "exists":true}],
  "repaired_dsl": "KEEP 时可等于原 DSL；FIX 时必须是完整 VGE-DSL；EXCLUDE 时可为空",
  "reason": "具体说明为什么 KEEP/FIX/EXCLUDE，以及如何对应人工批注/质量规则",
  "needs_human_review": true | false
}
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append_jsonl(path: Path, record: dict[str, Any], lock: threading.Lock) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, ensure_ascii=False) + "\n"
    with lock:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, count=1, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text, count=1)
    start = text.find("{")
    if start < 0:
        raise ValueError("response contains no JSON object")
    value, _ = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(value, dict):
        raise ValueError("response JSON is not an object")
    return value


def response_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if choices:
        content = (choices[0].get("message") or {}).get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    raise ValueError("API response has no assistant text")


def usage_from(response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("usage")
    if isinstance(usage, dict):
        return usage
    raw = response.get("_anthropic_raw") or {}
    return raw.get("usage") if isinstance(raw.get("usage"), dict) else {}


def slot_config(env_file: Path, slot: int, *, timeout: int, max_tokens: int, temperature: float) -> dict[str, Any]:
    values = read_env_file(env_file)
    merged = {**{key: value for key, value in os.environ.items() if key.startswith("VIBE_TEACHER_")}, **values}
    slot_name = str(slot)
    endpoint = next((item for item in collect_teacher_endpoints(merged) if item.get("slot") == slot_name), None)
    if endpoint is None:
        raise ValueError(f"ENV Slot {slot_name} is not fully configured in {env_file}")
    return {
        **endpoint,
        "timeout": timeout,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "api_retries": int(values.get("VIBE_TEACHER_API_RETRIES", "4")),
        "api_retry_backoff": float(values.get("VIBE_TEACHER_API_RETRY_BACKOFF", "1.5")),
    }


def local_check(source_id: str, intent: str, assets: list[dict[str, Any]], dsl: str) -> dict[str, Any]:
    try:
        compiled = compile_patch(dsl, intent=intent, asset_catalog=assets)
        canonical = serialize_patch(compiled).rstrip()
        reparsed = parse_program(canonical)
        roundtrip_ok = normalize_for_comparison(compiled) == normalize_for_comparison(reparsed)
        errors, warnings, _ = audit_row({
            "source_id": source_id,
            "intent": intent,
            "asset_catalog": assets,
            "dsl": canonical,
            "output": compiled,
        })
        return {
            "parse_valid": True,
            "static_valid": not errors,
            "roundtrip_ok": roundtrip_ok,
            "errors": errors,
            "warnings": warnings,
            "canonical_dsl": canonical,
            "command_count": len(compiled.get("commands") or []),
            "event_count": len(compiled.get("extra_events") or []),
        }
    except Exception as error:
        return {
            "parse_valid": False,
            "static_valid": False,
            "roundtrip_ok": False,
            "errors": [str(error)],
            "warnings": [],
            "canonical_dsl": "",
        }


def normalize_repair(source_id: str, original: dict[str, Any], value: dict[str, Any]) -> dict[str, Any]:
    verdict = str(value.get("verdict", "")).strip().upper()
    if verdict not in {"KEEP", "FIX", "EXCLUDE"}:
        raise ValueError(f"invalid verdict {verdict!r}")
    try:
        confidence = float(value.get("confidence", 0))
    except (TypeError, ValueError) as error:
        raise ValueError("confidence must be numeric") from error
    if not 0 <= confidence <= 1:
        raise ValueError("confidence must be between 0 and 1")
    issue_types_raw = value.get("issue_types", [])
    if not isinstance(issue_types_raw, list):
        raise ValueError("issue_types must be an array")
    issue_types = [str(item).strip() for item in issue_types_raw if str(item).strip()]
    reason = str(value.get("reason", "")).strip()
    if not reason:
        raise ValueError("reason is empty")
    if verdict == "EXCLUDE":
        return {
            "source_id": source_id,
            "action": "EXCLUDE",
            "reason": reason,
            "api_verdict": verdict,
            "confidence": confidence,
            "issue_types": issue_types,
            "needs_human_review": bool(value.get("needs_human_review")),
        }

    intent = str(value.get("repaired_intent") or original.get("intent") or "").strip()
    dsl = str(value.get("repaired_dsl") or original.get("dsl") or "").strip()
    assets = value.get("repaired_asset_catalog")
    if assets is None:
        assets = original.get("asset_catalog") or []
    if not isinstance(assets, list):
        raise ValueError("repaired_asset_catalog must be an array")
    if not intent or not dsl:
        raise ValueError("repaired_intent and repaired_dsl are required for KEEP/FIX")
    for asset in assets:
        if not isinstance(asset, dict) or not str(asset.get("id", "")).strip() or not str(asset.get("type", "")).strip():
            raise ValueError("each asset must be an object with id and type")
    return {
        "source_id": source_id,
        "action": verdict,
        "intent": intent,
        "asset_catalog": assets,
        "dsl": dsl,
        "reason": reason if verdict == "FIX" else f"API KEEP: {reason}",
        "api_verdict": verdict,
        "confidence": confidence,
        "issue_types": issue_types,
        "needs_human_review": bool(value.get("needs_human_review")),
    }


def manual_notes(review_results: Path) -> dict[str, dict[str, Any]]:
    if not review_results.is_file():
        return {}
    raw = json.loads(review_results.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return {}
    by_source: dict[str, dict[str, Any]] = {}
    for item in raw.values():
        if not isinstance(item, dict):
            continue
        source_id = str(item.get("source_id", "")).strip()
        if not source_id:
            continue
        previous = by_source.get(source_id)
        if previous is None or str(item.get("time", "")) >= str(previous.get("time", "")):
            by_source[source_id] = item
    return by_source


def build_candidate_rows(data_dir: Path, notes: dict[str, dict[str, Any]], only_reviewed_fails: bool) -> list[dict[str, Any]]:
    rows = read_jsonl(data_dir / "converted.jsonl")
    if only_reviewed_fails:
        fail_ids = {sid for sid, note in notes.items() if note.get("verdict") == "fail"}
        rows = [row for row in rows if row.get("source_id") in fail_ids]
    return rows


def should_skip_completed(output_dir: Path) -> set[str]:
    done: set[str] = set()
    for name in ("accepted-repairs.jsonl", "keep.jsonl", "excluded.jsonl"):
        for row in read_jsonl(output_dir / name):
            source_id = str(row.get("source_id", "")).strip()
            if source_id:
                done.add(source_id)
    return done


def repair_messages(row: dict[str, Any], note: dict[str, Any] | None, current_repair: dict[str, Any] | None) -> list[dict[str, str]]:
    source_id = str(row["source_id"])
    check = local_check(source_id, str(row.get("intent", "")), list(row.get("asset_catalog") or []), str(row.get("dsl", "")))
    payload = {
        "source_id": source_id,
        "task": row.get("intent", ""),
        "asset_catalog": row.get("asset_catalog", []),
        "dsl": row.get("dsl", ""),
        "local_check": check,
        "manual_review": note or {},
        "current_repair_reason": (current_repair or {}).get("reason", ""),
        "important_instruction": (
            "逐条语义判断，不要做机械批量替换。只有当 TASK/ASSETS/DSL 三者已经高质量对齐时才 KEEP；"
            "否则 FIX。修复时可以同时改 TASK、ASSETS、DSL，但不要绕过原始意图。"
        ),
    }
    return [
        {"role": "system", "content": REPAIR_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def repair_one(
    row: dict[str, Any],
    note: dict[str, Any] | None,
    current_repair: dict[str, Any] | None,
    config: dict[str, Any],
) -> dict[str, Any]:
    started = time.monotonic()
    messages = repair_messages(row, note, current_repair)
    response = call_teacher(config, messages, use_tools=False)
    text = response_text(response)
    value = parse_json_object(text)
    repair = normalize_repair(str(row["source_id"]), row, value)
    if repair["action"] == "EXCLUDE":
        check = {"parse_valid": None, "static_valid": None, "errors": [], "warnings": []}
    else:
        check = local_check(repair["source_id"], repair["intent"], repair["asset_catalog"], repair["dsl"])
        if not check.get("parse_valid") or not check.get("static_valid") or not check.get("roundtrip_ok"):
            raise ValueError(f"candidate repair failed local gate: {check}")
        repair["dsl"] = str(check.get("canonical_dsl") or repair["dsl"]).strip()
    return {
        "time": utc_now(),
        "source_id": row["source_id"],
        "elapsed_sec": round(time.monotonic() - started, 3),
        "request_hash": sha256(json.dumps(messages, ensure_ascii=False, sort_keys=True)),
        "api_model": config.get("model"),
        "endpoint_slot": str(config.get("slot")),
        "usage": usage_from(response),
        "manual_review": note or {},
        "repair": repair,
        "local_check": check,
        "raw_response": value,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="API-based semantic repair pass for VGE-DSL corpus")
    parser.add_argument("--slot", type=int, choices=(1, 2, 3, 4), default=3)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--current-repairs", type=Path, default=DEFAULT_CURRENT_REPAIRS)
    parser.add_argument("--review-results", type=Path, default=DEFAULT_REVIEW_RESULTS)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--only-reviewed-fails", action="store_true")
    parser.add_argument("--no-resume", action="store_true")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-tokens", type=int, default=4096)
    parser.add_argument("--temperature", type=float, default=0.0)
    args = parser.parse_args()

    config = slot_config(args.env_file, args.slot, timeout=args.timeout, max_tokens=args.max_tokens, temperature=args.temperature)
    notes = manual_notes(args.review_results)
    current_repairs = {row["source_id"]: row for row in read_jsonl(args.current_repairs)}
    rows = build_candidate_rows(args.data_dir, notes, args.only_reviewed_fails)
    rows = rows[args.offset:]
    if args.limit > 0:
        rows = rows[: args.limit]

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    completed = set() if args.no_resume else should_skip_completed(output_dir)
    pending = [row for row in rows if str(row.get("source_id")) not in completed]

    write_json(output_dir / "status.json", {
        "schema_version": "vge-dsl-api-repair-status-v1",
        "time": utc_now(),
        "data_dir": str(args.data_dir),
        "output_dir": str(output_dir),
        "slot": str(args.slot),
        "model": config.get("model"),
        "workers": args.workers,
        "selected_rows": len(rows),
        "already_completed": len(rows) - len(pending),
        "pending": len(pending),
        "only_reviewed_fails": args.only_reviewed_fails,
    })
    print(json.dumps({
        "selected": len(rows),
        "pending": len(pending),
        "completed": len(rows) - len(pending),
        "slot": str(args.slot),
        "model": config.get("model"),
        "output_dir": str(output_dir),
    }, ensure_ascii=False))

    lock = threading.Lock()
    counters = collections.Counter()

    def worker(row: dict[str, Any]) -> None:
        source_id = str(row["source_id"])
        try:
            result = repair_one(row, notes.get(source_id), current_repairs.get(source_id), config)
            repair = result["repair"]
            if repair["action"] == "EXCLUDE":
                append_jsonl(output_dir / "excluded.jsonl", {**repair, "api_result": result}, lock)
                counters["excluded"] += 1
            elif repair.get("api_verdict") == "KEEP":
                append_jsonl(output_dir / "keep.jsonl", {**repair, "api_result": result}, lock)
                counters["keep"] += 1
            else:
                accepted = {
                    "source_id": repair["source_id"],
                    "action": "FIX",
                    "intent": repair["intent"],
                    "asset_catalog": repair["asset_catalog"],
                    "dsl": repair["dsl"],
                    "reason": repair["reason"],
                }
                append_jsonl(output_dir / "accepted-repairs.jsonl", accepted, lock)
                append_jsonl(output_dir / "all-results.jsonl", result, lock)
                counters["fix"] += 1
        except Exception as error:
            append_jsonl(output_dir / "errors.jsonl", {
                "time": utc_now(),
                "source_id": source_id,
                "error": str(error),
            }, lock)
            counters["errors"] += 1

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(worker, row) for row in pending]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            future.result()
            if index % 10 == 0 or index == len(futures):
                write_json(output_dir / "status.json", {
                    "schema_version": "vge-dsl-api-repair-status-v1",
                    "time": utc_now(),
                    "selected_rows": len(rows),
                    "processed_this_run": index,
                    "pending_at_start": len(pending),
                    "counters": dict(counters),
                    "slot": str(args.slot),
                    "model": config.get("model"),
                })
                print(json.dumps({"processed": index, "total": len(futures), "counters": dict(counters)}, ensure_ascii=False))

    write_json(output_dir / "manifest.json", {
        "schema_version": "vge-dsl-api-repair-manifest-v1",
        "time": utc_now(),
        "data_dir": str(args.data_dir),
        "output_dir": str(output_dir),
        "slot": str(args.slot),
        "model": config.get("model"),
        "selected_rows": len(rows),
        "processed_this_run": len(pending),
        "counters": dict(counters),
        "accepted_repairs": str(output_dir / "accepted-repairs.jsonl"),
        "keep": str(output_dir / "keep.jsonl"),
        "excluded": str(output_dir / "excluded.jsonl"),
        "errors": str(output_dir / "errors.jsonl"),
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
