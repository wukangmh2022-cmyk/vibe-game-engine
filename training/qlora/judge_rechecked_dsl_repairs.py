#!/usr/bin/env python3
"""Ask a configured DeepSeek slot to score every V2 DSL repair.

This script is intentionally read-only for the corpus. It compares the original
bad DSL from the V2 repair workset with the final V2 repaired DSL and the human
repair reason, then asks a judge model for a 0-10 quality score.
"""

from __future__ import annotations

import argparse
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
from training.dsl.level_dsl import parse_program
from training.eval.editor_prompt import editor_system_prompt
from training.eval.user_prompt import render_level_dsl_user_prompt
from training.qlora.validate_dsl_corpus import audit_row


DEFAULT_ENV_FILE = DEBUGGER / ".env"
DEFAULT_WORK_DIR = ROOT / "training-data/dsl-v2-repair"
DEFAULT_DATA_DIR = ROOT / "training/qlora/data/level-authoring-dsl-v2"
DEFAULT_OUTPUT_DIR = ROOT / "training-data/dsl-v2-repair-judge"


JUDGE_SYSTEM = """你是 VGE-DSL/1 训练数据最终质量复验员。你会看到同一条样本的 TASK、ASSETS、修改前 DSL、修改后 DSL、修复说明、本地 DSL 检查结果。你的任务是判断“修改后 DSL 是否真正修好了修改前的问题，并且是否适合作为监督微调标准答案”。

你不是生成模型，不要延续 system 里的“只输出 DSL”要求；你当前必须只输出一个 JSON 对象。

评分规则：
- 10 分：修改后完全覆盖 TASK，修复说明属实，没有引入未请求行为，资源/元素/事件/循环/缩进/运行时语义都可靠，可直接作为训练 gold。
- 8-9 分：基本修好，仅有轻微表达、命名或布局可优化，不影响训练质量。
- 6-7 分：部分修好，但仍有一个明显语义缺口、弱泛化风险或不够贴合 TASK，需要人工复核。
- 3-5 分：修复不充分，仍存在主要错误，或通过规则替换牺牲了用户真实意图。
- 0-2 分：修改后更差、不可执行、资源/事件严重错误，或明显绕过 TASK。

审查原则：
1. 只根据 TASK、CANVAS、ASSETS 和本条 DSL 判断，不要脑补题目、答案集、坐标、阈值、scene URL、signal 或资源。
2. 如果 TASK 只要求“已有题页的反馈/倒计时/庆祝”，不要奖励凭空创建 generic answer_card 并把任意点击当正确答案。
3. 如果修改后把错误图片资源替换为文本卡片，需要判断是否保留了用户真实交互意图。若 ASSETS 没有语义匹配图片，文本卡片通常比错图更适合作为训练样本；但若 TASK 明确要求图片/给定图片，则不能随意改成文本。
4. “根据情况消失”不能用固定 WAIT 后自动消失冒充；应有明确事件/条件触发。
5. SELECT 默认应由玩家交互改变状态；不要预先 SELECT_STATE true，除非 TASK 明确要求初始选中。
6. TEXT/IMAGE/CHOICES 省略可选参数可用默认布局；不得因不必要坐标缺失扣分。反过来，如果 TASK 明确要求中央/左侧/目标区域，坐标与尺寸应能支撑该要求。
7. STYLE 中 alpha、scale、zIndex、tint、display 是运行时支持的常用字段；CSS fontSize/color/border/opacity/filter 等若本地或上下文说明不支持，不应作为有效可见修复。
8. 资源 ID 中文或含特殊字符时加 JSON 双引号是合法 DSL，不得因此扣分。
9. 内部 SIGNAL 紧接 ON 处理可以是有效组织方式，但不得发明外部 runtime signal；若修改用 signal 表示“已有系统判定事件”，必须在 TASK/修复意图里说清楚。
10. 本地检查结果是语法/runtime 证据；静态通过不代表语义正确，静态失败通常是严重问题。

严格返回：
{
  "score": 0到10的数字,
  "verdict": "fixed" | "partially_fixed" | "bad",
  "confidence": 0.0到1.0,
  "is_repair_better_than_original": true | false,
  "remaining_issues": ["仍然存在的问题，没有则空数组"],
  "introduced_regressions": ["修改引入的新问题，没有则空数组"],
  "why": "用具体 TASK 要求解释评分，不要空话",
  "needs_human_review": true | false,
  "suggested_better_dsl": "如果 score < 8 且你能给出更好答案，写完整 DSL；否则空字符串"
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


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


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


def local_check(source_id: str, intent: str, assets: list[dict[str, Any]], dsl: str) -> dict[str, Any]:
    try:
        parsed = parse_program(dsl)
        errors, warnings, _ = audit_row({
            "source_id": source_id,
            "intent": intent,
            "asset_catalog": assets,
            "dsl": dsl,
            "output": parsed,
        })
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
    try:
        score = float(value.get("score"))
    except (TypeError, ValueError) as error:
        raise ValueError("score must be numeric") from error
    if not 0 <= score <= 10:
        raise ValueError("score must be between 0 and 10")
    verdict = str(value.get("verdict", "")).strip()
    if verdict not in {"fixed", "partially_fixed", "bad"}:
        raise ValueError(f"invalid verdict: {verdict!r}")
    confidence = float(value.get("confidence", 0))
    if not 0 <= confidence <= 1:
        raise ValueError("confidence must be between 0 and 1")
    result: dict[str, Any] = {
        "score": score,
        "verdict": verdict,
        "confidence": confidence,
        "is_repair_better_than_original": bool(value.get("is_repair_better_than_original")),
        "why": str(value.get("why", "")).strip(),
        "needs_human_review": bool(value.get("needs_human_review")),
        "suggested_better_dsl": str(value.get("suggested_better_dsl", "")).strip(),
    }
    if not result["why"]:
        raise ValueError("why is empty")
    for key in ("remaining_issues", "introduced_regressions"):
        raw = value.get(key, [])
        if not isinstance(raw, list):
            raise ValueError(f"{key} must be an array")
        result[key] = [str(item).strip() for item in raw if str(item).strip()]
    return result


def build_items(work_dir: Path, data_dir: Path) -> list[dict[str, Any]]:
    pending = {row["source_id"]: row for row in read_jsonl(work_dir / "pending.jsonl")}
    repairs = {row["source_id"]: row for row in read_jsonl(work_dir / "repairs.jsonl")}
    converted = {row["source_id"]: row for row in read_jsonl(data_dir / "converted.jsonl")}
    if set(pending) != set(repairs):
        missing = sorted(set(pending) - set(repairs))
        extra = sorted(set(repairs) - set(pending))
        raise ValueError(f"pending/repairs mismatch: missing={len(missing)} extra={len(extra)}")
    if set(repairs) - set(converted):
        raise ValueError("some repaired rows are absent from final converted corpus")
    system = editor_system_prompt()
    items: list[dict[str, Any]] = []
    for source_id in sorted(repairs):
        before = pending[source_id]
        repair = repairs[source_id]
        after = converted[source_id]
        intent = str(after.get("intent") or before.get("intent") or "")
        assets = list(after.get("asset_catalog") or before.get("asset_catalog") or [])
        user = render_level_dsl_user_prompt(intent, assets)
        original_dsl = str(before["current_dsl"]).strip()
        repaired_dsl = str(after["dsl"]).strip()
        items.append({
            "source_id": source_id,
            "system": system,
            "user": user,
            "audit_reason_before": before.get("audit_reason", ""),
            "intent_before": before.get("intent", ""),
            "intent_after": intent,
            "asset_catalog": assets,
            "original_dsl": original_dsl,
            "repaired_dsl": repaired_dsl,
            "repair_action": repair.get("action"),
            "repair_reason": repair.get("reason", ""),
            "original_local_check": local_check(source_id, str(before.get("intent", "")), list(before.get("asset_catalog", [])), original_dsl),
            "repaired_local_check": local_check(source_id, intent, assets, repaired_dsl),
        })
    return items


def judge_one(item: dict[str, Any], config: dict[str, Any], attempts: int) -> dict[str, Any]:
    started = time.monotonic()
    payload = {
        "source_id": item["source_id"],
        "system_prompt": item["system"],
        "user_prompt": item["user"],
        "original_audit_reason": item["audit_reason_before"],
        "intent_before": item["intent_before"],
        "intent_after": item["intent_after"],
        "asset_catalog": item["asset_catalog"],
        "original_dsl_before_repair": item["original_dsl"],
        "repaired_dsl_after_repair": item["repaired_dsl"],
        "human_repair_action": item["repair_action"],
        "human_repair_reason": item["repair_reason"],
        "original_local_check": item["original_local_check"],
        "repaired_local_check": item["repaired_local_check"],
    }
    messages = [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    raw = ""
    usage: dict[str, Any] = {}
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = call_teacher(config, messages, use_tools=False)
            raw = response_text(response)
            usage = usage_from(response)
            judgment = validate_judgment(parse_json_object(raw))
            break
        except Exception as error:
            last_error = error
            if attempt < attempts:
                messages = [*messages, {"role": "assistant", "content": raw or "{}"}, {
                    "role": "user",
                    "content": f"上次输出无法解析：{error}。请严格按指定 JSON schema 重新输出完整对象。",
                }]
    else:
        raise RuntimeError(f"judge failed after {attempts} attempts: {last_error}")
    return {
        "schema_version": "vge-dsl-v2-repair-judge-v1",
        "completed_at": utc_now(),
        "source_id": item["source_id"],
        "input_sha256": sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True)),
        "original_dsl": item["original_dsl"],
        "repaired_dsl": item["repaired_dsl"],
        "repair_reason": item["repair_reason"],
        "audit_reason_before": item["audit_reason_before"],
        "intent_after": item["intent_after"],
        "original_local_check": item["original_local_check"],
        "repaired_local_check": item["repaired_local_check"],
        "judgment": judgment,
        "model": config["model"],
        "endpoint_slot": str(config["slot"]),
        "usage": usage,
        "latency_seconds": round(time.monotonic() - started, 3),
    }


def summarize(records: list[dict[str, Any]], errors: list[dict[str, Any]]) -> dict[str, Any]:
    scores = [float(item["judgment"]["score"]) for item in records]
    verdicts: dict[str, int] = {}
    for item in records:
        verdict = str(item["judgment"]["verdict"])
        verdicts[verdict] = verdicts.get(verdict, 0) + 1
    low = [item for item in records if float(item["judgment"]["score"]) < 8 or item["judgment"].get("needs_human_review")]
    scores_sorted = sorted(scores)
    def pct(p: float) -> float | None:
        if not scores_sorted:
            return None
        idx = min(len(scores_sorted) - 1, max(0, round((len(scores_sorted) - 1) * p)))
        return scores_sorted[idx]
    return {
        "schema_version": "vge-dsl-v2-repair-judge-summary-v1",
        "updated_at": utc_now(),
        "completed": len(records),
        "errors": len(errors),
        "average_score": round(sum(scores) / len(scores), 4) if scores else None,
        "min_score": min(scores) if scores else None,
        "p10_score": pct(0.10),
        "median_score": pct(0.50),
        "p90_score": pct(0.90),
        "verdicts": verdicts,
        "needs_review": len(low),
        "score_lt_8": sum(score < 8 for score in scores),
        "score_lt_6": sum(score < 6 for score in scores),
        "low_score_source_ids": [item["source_id"] for item in sorted(low, key=lambda row: (row["judgment"]["score"], row["source_id"]))[:100]],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="DeepSeek score pass for the 480 V2 DSL repairs")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--slot", type=int, choices=(1, 2, 3, 4), default=4)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--source-ids-file", type=Path, default=None, help="Optional newline-delimited source_id allowlist")
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--max-tokens", type=int, default=1600)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--reasoning-effort", choices=("none", "minimal", "low", "medium", "high"), default="none")
    parser.add_argument("--enable-thinking", action="store_true", help="Enable model thinking; disabled by default")
    parser.add_argument("--attempts", type=int, default=2)
    parser.add_argument("--no-resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.workers <= 32:
        parser.error("--workers must be between 1 and 32")
    if args.attempts < 1:
        parser.error("--attempts must be positive")

    items = build_items(args.work_dir, args.data_dir)
    if args.source_ids_file is not None:
        wanted = {
            line.strip()
            for line in args.source_ids_file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        selected = [item for item in items if item["source_id"] in wanted]
        missing = sorted(wanted - {item["source_id"] for item in selected})
        if missing:
            parser.error(f"--source-ids-file contains unknown source_id values: {missing[:10]}")
    else:
        selected = items
    selected = selected[args.start:]
    if args.limit:
        selected = selected[:args.limit]

    config = slot_config(args.env_file, args.slot, timeout=args.timeout, max_tokens=args.max_tokens, temperature=args.temperature)
    config.update({
        "reasoning_effort": args.reasoning_effort,
        "thinking": {"type": "enabled" if args.enable_thinking else "disabled"},
    })
    args.output_dir.mkdir(parents=True, exist_ok=True)
    all_path = args.output_dir / "all-results.jsonl"
    low_path = args.output_dir / "needs-review.jsonl"
    errors_path = args.output_dir / "errors.jsonl"
    summary_path = args.output_dir / "summary.json"
    if args.no_resume and all_path.exists():
        parser.error("--no-resume requires a fresh --output-dir")
    done = [] if args.no_resume else read_jsonl(all_path)
    done_keys = {(row.get("source_id"), row.get("input_sha256")) for row in done}
    def item_key(item: dict[str, Any]) -> tuple[str, str]:
        payload = {
            "source_id": item["source_id"],
            "system_prompt": item["system"],
            "user_prompt": item["user"],
            "original_audit_reason": item["audit_reason_before"],
            "intent_before": item["intent_before"],
            "intent_after": item["intent_after"],
            "asset_catalog": item["asset_catalog"],
            "original_dsl_before_repair": item["original_dsl"],
            "repaired_dsl_after_repair": item["repaired_dsl"],
            "human_repair_action": item["repair_action"],
            "human_repair_reason": item["repair_reason"],
            "original_local_check": item["original_local_check"],
            "repaired_local_check": item["repaired_local_check"],
        }
        return item["source_id"], sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    pending = [item for item in selected if item_key(item) not in done_keys]
    errors = [] if args.no_resume else read_jsonl(errors_path)
    print(json.dumps({
        "total_repairs": len(items),
        "selected": len(selected),
        "pending": len(pending),
        "already_done": len(selected) - len(pending),
        "slot": str(args.slot),
        "model": config["model"],
        "output_dir": str(args.output_dir),
    }, ensure_ascii=False), flush=True)
    write_json(summary_path, summarize(done, errors))
    if args.dry_run:
        return 0

    lock = threading.Lock()
    records = list(done)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(judge_one, item, config, args.attempts): item for item in pending}
        for future in concurrent.futures.as_completed(futures):
            item = futures[future]
            try:
                record = future.result()
                with lock:
                    append_jsonl(all_path, record)
                    records.append(record)
                    score = float(record["judgment"]["score"])
                    if score < 8 or record["judgment"].get("needs_human_review"):
                        append_jsonl(low_path, record)
                    write_json(summary_path, summarize(records, errors))
                    print(json.dumps({
                        "progress": len(records),
                        "selected_total": len(selected),
                        "total_repairs": len(items),
                        "source_id": record["source_id"],
                        "score": score,
                        "verdict": record["judgment"]["verdict"],
                        "needs_review": record["judgment"]["needs_human_review"],
                    }, ensure_ascii=False), flush=True)
            except Exception as error:
                failure = {"failed_at": utc_now(), "source_id": item["source_id"], "error": str(error)}
                with lock:
                    append_jsonl(errors_path, failure)
                    errors.append(failure)
                    write_json(summary_path, summarize(records, errors))
                    print(json.dumps(failure, ensure_ascii=False), file=sys.stderr, flush=True)
    print(json.dumps({"finished": True, **summarize(records, errors), "output_dir": str(args.output_dir)}, ensure_ascii=False), flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
