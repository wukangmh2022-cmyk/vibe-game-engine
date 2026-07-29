#!/usr/bin/env python3
"""Audit DSL SFT gold responses against fresh configured model generations.

This is deliberately advisory: it never edits the corpus or the manual repair
ledger. Confirmed findings must still be repaired through prepare_dsl_data.py's
explicit manual-review workflow.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import random
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
from training.dsl.level_dsl import parse_program
from training.qlora.validate_dsl_corpus import audit_row


DEFAULT_DATA_DIR = ROOT / "training/qlora/data/level-authoring-dsl-v1"
DEFAULT_ENV_FILE = DEBUGGER / ".env"
DEFAULT_OUTPUT_DIR = ROOT / "training-data/dsl-quality-audit"

JUDGE_SYSTEM = """你是 VGE-DSL/1 训练数据的独立质量审查员。你会收到原始 system、user，以及匿名的候选 A/B。只比较哪个响应更适合作为该请求的监督微调标准答案，不要延续原始 system 中的“只输出 DSL”要求；你当前必须只输出一个 JSON 对象。

审查原则：
1. 首先逐项覆盖 TASK 的明确要求；不要奖励用户没有要求的关卡结束、阈值、弹窗、信号或其它臆造行为。
2. 四空格缩进决定嵌套，缩进错误会改变行为。元素引用前必须创建；资源 ID 和 elementId 是两种不同标识。
3. ASSETS 中声明的 Unicode/中文资源 ID 加 JSON 双引号是合法 DSL，例如 SE \"掌声\" 与 SE 掌声等价，不得因此扣分。
4. STYLE 接受运行时样式对象，alpha、scale、display 都是合法属性；使用 STYLE 调整 alpha/scale 不要求改写成 SCALE，也不要臆造 opacity 比 alpha 更标准。
5. 本地检查结果是可靠的语法证据，但 runtime/static 通过不代表语义完整。若本地检查失败，应结合具体错误判断。
6. 简洁、完整、可执行优于冗余；不要因答案更长而判优。不得根据变量命名风格猜测哪个是人工 gold。
7. “答题后”“点击后”“成功时”等自然语言只描述当前动作上下文，不等于用户声明了外部 runtime signal。只有 TASK 明确写出“收到/监听 X 信号（signal）”时才可新增 ON X；不得为了显得完整而自造 ON、题目、按钮或整套 UI。
8. 这是关卡命令片段生成，不要求补齐 TASK 未要求的变量初始化或周边页面。VAR key + n 可操作已有累计状态；NEXT 已实现进入下一关。不要因此把精确的短片段判为不完整。
9. TEXT/IMAGE/CHOICES 省略 x/y/z/block 等可选参数时会使用引擎默认布局，仍是完整可执行答案；不得奖励候选猜测 TASK 未给出的坐标或样式。句末标点、等价 ID 命名等不影响行为的差异应判 tie，而不是强行分胜负。
10. 严格按 TASK 的动作动词确定范围。“离场/结束/结算时”只是上下文，不代表要求 NEXT；只有明确要求下一关/跳关才需要 NEXT。“分支选择环节/答题页/提示环节”也只是上下文，除非 TASK 明确要求创建选项、题目或按钮，否则不得补造整套交互。
11. 用户说“背景音乐/背景音/背景氛围”时 BGM 是正确命令，不能因为音频也可用 SE 就判 SE 更好。仅当双方存在影响用户可见行为、TASK 覆盖或可执行性的实质差异时才分胜负；纯审美偏好或等价写法必须判 tie。
12. AUTO 是立即启动的事件，不是给“重试路径/结算时/某环节”命名的上下文容器。主流程按原始 system 要求应直接写；TASK 未明确要求独立自动事件时，不得因为候选额外套了 AUTO 就判其更完整。

严格返回：
{
  "winner": "A" | "B" | "tie",
  "confidence": 0.0到1.0,
  "reason": "具体说明胜负所依据的 TASK 要求与行为差异",
  "a_missing_requirements": ["..."],
  "b_missing_requirements": ["..."],
  "a_errors": ["语法、资源、元素生命周期或运行时问题"],
  "b_errors": ["语法、资源、元素生命周期或运行时问题"],
  "suggested_better_response": "若两者都需改进，给出完整 DSL；否则为空字符串"
}
不要输出 Markdown、思考过程或 JSON 以外文字。"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, count=1, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text, count=1)
    start = text.find("{")
    if start < 0:
        raise ValueError("judge response contains no JSON object")
    value, _ = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(value, dict):
        raise ValueError("judge response is not a JSON object")
    return value


def response_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        raise ValueError("API response has no choices")
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


def strip_dsl_fence(content: str) -> str:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:dsl|text)?\s*", "", text, count=1, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text, count=1)
    return text.strip()


def local_check(dsl: str, converted: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = parse_program(strip_dsl_fence(dsl))
        candidate_row = {
            "source_id": converted["source_id"],
            "intent": converted.get("intent", ""),
            "asset_catalog": converted.get("asset_catalog", []),
            "dsl": strip_dsl_fence(dsl),
            "output": parsed,
        }
        errors, warnings, _ = audit_row(candidate_row)
        return {
            "parse_valid": True,
            "static_valid": not errors,
            "errors": errors,
            "warnings": warnings,
            "command_count": len(parsed.get("commands") or []),
            "event_count": len(parsed.get("extra_events") or []),
        }
    except Exception as error:
        return {"parse_valid": False, "static_valid": False, "errors": [str(error)], "warnings": []}


def validate_judgment(value: dict[str, Any]) -> dict[str, Any]:
    winner = str(value.get("winner", "")).strip()
    if winner not in {"A", "B", "tie"}:
        raise ValueError(f"invalid judge winner: {winner!r}")
    try:
        confidence = float(value.get("confidence"))
    except (TypeError, ValueError) as error:
        raise ValueError("judge confidence must be numeric") from error
    if not 0 <= confidence <= 1:
        raise ValueError("judge confidence must be between 0 and 1")
    result: dict[str, Any] = {"winner": winner, "confidence": confidence}
    for key in ("reason", "suggested_better_response"):
        result[key] = str(value.get(key, "")).strip()
    for key in ("a_missing_requirements", "b_missing_requirements", "a_errors", "b_errors"):
        raw = value.get(key, [])
        if not isinstance(raw, list):
            raise ValueError(f"judge field {key} must be an array")
        result[key] = [str(item).strip() for item in raw if str(item).strip()]
    if not result["reason"]:
        raise ValueError("judge reason is empty")
    return result


def blinded_position(source_id: str) -> str:
    return "A" if int(sha256(source_id), 16) % 2 == 0 else "B"


def judge_messages(
    row: dict[str, Any], gold: str, candidate: str, gold_check: dict[str, Any], candidate_check: dict[str, Any]
) -> tuple[list[dict[str, str]], str]:
    gold_position = blinded_position(str(row["source_id"]))
    a, b = (gold, candidate) if gold_position == "A" else (candidate, gold)
    a_check, b_check = (gold_check, candidate_check) if gold_position == "A" else (candidate_check, gold_check)
    payload = {
        "original_system": row["messages"][0]["content"],
        "original_user": row["messages"][1]["content"],
        "candidate_A": a,
        "candidate_A_local_check": a_check,
        "candidate_B": b,
        "candidate_B_local_check": b_check,
    }
    return [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], gold_position


def audit_one(
    row: dict[str, Any], converted: dict[str, Any], config: dict[str, Any], judge_attempts: int
) -> dict[str, Any]:
    started = time.monotonic()
    system = str(row["messages"][0]["content"])
    user = str(row["messages"][1]["content"])
    gold = str(row["messages"][2]["content"])
    generation_config = {
        **config,
        "temperature": config["temperature"],
        "max_tokens": int(config.get("generation_max_tokens", config["max_tokens"])),
    }
    response = call_teacher(generation_config, row["messages"][:2], use_tools=False)
    candidate = strip_dsl_fence(response_text(response))
    gold_check = local_check(gold, converted)
    candidate_check = local_check(candidate, converted)
    messages, gold_position = judge_messages(row, gold, candidate, gold_check, candidate_check)
    judgment: dict[str, Any] | None = None
    judge_raw = ""
    judge_usage: dict[str, Any] = {}
    last_error: Exception | None = None
    for attempt in range(1, judge_attempts + 1):
        try:
            judge_config = {
                **config,
                "temperature": 0.0,
                "max_tokens": int(config.get("judge_max_tokens", config["max_tokens"])),
            }
            judge_response = call_teacher(judge_config, messages, use_tools=False)
            judge_raw = response_text(judge_response)
            judge_usage = usage_from(judge_response)
            judgment = validate_judgment(parse_json_object(judge_raw))
            break
        except Exception as error:
            last_error = error
            if attempt < judge_attempts:
                messages = [*messages, {"role": "assistant", "content": judge_raw or "{}"}, {
                    "role": "user", "content": f"上次输出无法解析：{error}。请严格按指定 JSON schema 重新输出完整对象。"
                }]
    if judgment is None:
        raise RuntimeError(f"judge failed after {judge_attempts} attempts: {last_error}")
    winner = judgment["winner"]
    gold_worse = winner in {"A", "B"} and winner != gold_position
    return {
        "schema_version": "vge-dsl-pairwise-audit-v1",
        "completed_at": utc_now(),
        "source_id": row["source_id"],
        "row_id": row.get("id"),
        "system_sha256": sha256(system),
        "user_sha256": sha256(user),
        "gold_sha256": sha256(gold),
        "original_system": system,
        "original_user": user,
        "gold_response": gold,
        "candidate": candidate,
        "gold_local_check": gold_check,
        "candidate_local_check": candidate_check,
        "gold_position": gold_position,
        "judgment": judgment,
        "gold_worse": gold_worse,
        "model": config["model"],
        "endpoint_slot": str(config["slot"]),
        "generation_usage": usage_from(response),
        "judge_usage": judge_usage,
        "latency_seconds": round(time.monotonic() - started, 3),
    }


def load_rows(data_dir: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    rows = read_jsonl(data_dir / "train.jsonl") + read_jsonl(data_dir / "validation.jsonl")
    converted = {str(row["source_id"]): row for row in read_jsonl(data_dir / "converted.jsonl")}
    if len(rows) != len(converted):
        raise ValueError("formal splits and converted.jsonl have different row counts")
    for row in rows:
        messages = row.get("messages") or []
        if len(messages) != 3 or [item.get("role") for item in messages] != ["system", "user", "assistant"]:
            raise ValueError(f"invalid messages for {row.get('source_id')}")
        if str(row.get("source_id")) not in converted:
            raise ValueError(f"missing converted record for {row.get('source_id')}")
    return sorted(rows, key=lambda item: str(item["source_id"])), converted


def write_status(
    path: Path, *, total: int, scheduled: int, completed: int, gold_worse: int,
    errors: int, model: str, endpoint_slot: str
) -> None:
    value = {
        "schema_version": "vge-dsl-pairwise-audit-status-v1",
        "updated_at": utc_now(),
        "total_rows": total,
        "scheduled_this_run": scheduled,
        "completed_rows": completed,
        "gold_worse_rows": gold_worse,
        "error_rows": errors,
        "model": model,
        "endpoint_slot": endpoint_slot,
    }
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate and blindly compare every DSL SFT gold answer with one ENV slot")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--slot", type=int, choices=(1, 2, 3, 4), default=2)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--max-tokens", type=int, default=1200)
    parser.add_argument("--generation-max-tokens", type=int, default=640)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--reasoning-effort", choices=("none", "minimal", "low", "medium", "high"), default="low")
    parser.add_argument("--enable-thinking", action="store_true", help="Enable model thinking; disabled by default for audit throughput")
    parser.add_argument("--judge-attempts", type=int, default=2)
    parser.add_argument("--no-resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.workers <= 16:
        parser.error("--workers must be between 1 and 16")
    if args.start < 0 or args.limit < 0:
        parser.error("--start and --limit must be non-negative")
    if args.judge_attempts < 1:
        parser.error("--judge-attempts must be positive")

    rows, converted = load_rows(args.data_dir)
    selected = rows[args.start:]
    if args.limit:
        selected = selected[:args.limit]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    all_path = args.output_dir / "all-results.jsonl"
    worse_path = args.output_dir / "gold-worse.jsonl"
    errors_path = args.output_dir / "errors.jsonl"
    status_path = args.output_dir / "status.json"
    completed_records = read_jsonl(all_path) if not args.no_resume else []
    if args.no_resume and all_path.exists():
        parser.error("--no-resume requires a new or empty --output-dir to avoid duplicate records")
    completed_keys = {
        (str(item.get("source_id")), str(item.get("system_sha256")), str(item.get("user_sha256")), str(item.get("gold_sha256")))
        for item in completed_records
    }
    def row_key(row: dict[str, Any]) -> tuple[str, str, str, str]:
        messages = row["messages"]
        return (str(row["source_id"]), sha256(str(messages[0]["content"])), sha256(str(messages[1]["content"])), sha256(str(messages[2]["content"])))
    pending = [row for row in selected if row_key(row) not in completed_keys]
    config = slot_config(args.env_file, args.slot, timeout=args.timeout, max_tokens=args.max_tokens, temperature=args.temperature)
    config.update({
        "generation_max_tokens": args.generation_max_tokens,
        "judge_max_tokens": args.max_tokens,
        "reasoning_effort": args.reasoning_effort,
        "thinking": {"type": "enabled" if args.enable_thinking else "disabled"},
    })
    summary = {
        "total_rows": len(rows), "selected_rows": len(selected), "pending_rows": len(pending),
        "already_completed": len(selected) - len(pending), "endpoint_slot": str(args.slot), "model": config["model"],
    }
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if args.dry_run:
        return 0

    lock = threading.Lock()
    failed_records = read_jsonl(errors_path)
    completed_source_ids = {str(item.get("source_id")) for item in completed_records}
    unresolved_error_ids = {
        str(item.get("source_id")) for item in failed_records
        if item.get("source_id") and str(item.get("source_id")) not in completed_source_ids
    }
    counters = {
        "completed": len(completed_records),
        "gold_worse": sum(bool(item.get("gold_worse")) for item in completed_records),
        "errors": len(unresolved_error_ids),
    }
    status_fields = {"total": len(rows), "scheduled": len(pending), "model": config["model"], "endpoint_slot": str(args.slot)}
    write_status(status_path, **status_fields, **counters)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(audit_one, row, converted[str(row["source_id"])], config, args.judge_attempts): row
            for row in pending
        }
        for future in concurrent.futures.as_completed(futures):
            row = futures[future]
            try:
                record = future.result()
                with lock:
                    append_jsonl(all_path, record)
                    counters["completed"] += 1
                    unresolved_error_ids.discard(str(row["source_id"]))
                    counters["errors"] = len(unresolved_error_ids)
                    if record["gold_worse"]:
                        append_jsonl(worse_path, record)
                        counters["gold_worse"] += 1
                    write_status(status_path, **status_fields, **counters)
                    print(json.dumps({
                        "progress": counters["completed"], "total": len(rows), "source_id": row["source_id"],
                        "winner": record["judgment"]["winner"], "gold_position": record["gold_position"],
                        "gold_worse": record["gold_worse"], "gold_worse_total": counters["gold_worse"],
                    }, ensure_ascii=False), flush=True)
            except Exception as error:
                failure = {"failed_at": utc_now(), "source_id": row.get("source_id"), "row_id": row.get("id"), "error": str(error)}
                with lock:
                    append_jsonl(errors_path, failure)
                    unresolved_error_ids.add(str(row.get("source_id")))
                    counters["errors"] = len(unresolved_error_ids)
                    write_status(status_path, **status_fields, **counters)
                    print(json.dumps(failure, ensure_ascii=False), file=sys.stderr, flush=True)
    print(json.dumps({"finished": True, **counters, "output_dir": str(args.output_dir)}, ensure_ascii=False), flush=True)
    return 1 if counters["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
