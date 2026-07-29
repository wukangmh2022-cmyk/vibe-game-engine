#!/usr/bin/env python3
"""Blind pairwise LLM judge for the human-fragment Base vs Adapter run.

The judge sees identical task/assets context and two anonymised candidate DSL
outputs. Candidate order is deterministic-random per case so aggregate stats do
not leak which model is which.
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
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEBUGGER = ROOT / "agent-debugger"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(DEBUGGER) not in sys.path:
    sys.path.insert(0, str(DEBUGGER))

from command_synthesize import collect_teacher_endpoints, read_env_file, teacher_request_headers


DEFAULT_ENV_FILE = DEBUGGER / ".env"
DEFAULT_CASES = ROOT / "training/eval/cases/human_fragment_benchmark_v1.json"
DEFAULT_ADAPTER = ROOT / "training/eval/results/adapter-human-fragment-v1/generations.complete.jsonl"
DEFAULT_BASE = ROOT / "training/eval/results/base-human-fragment-v1/generations.complete.jsonl"
DEFAULT_OUTPUT_DIR = ROOT / "training/eval/results/human-fragment-v1-slot3-judge"

JUDGE_SYSTEM = """你是独立的 2D 游戏关卡 DSL 语义评审员。你不知道候选来自哪个模型，不能猜测身份。只根据 TASK、ASSETS、参考 DSL 片段和两个候选 DSL 判断哪个更适合进入游戏编辑器。

评审重点：
1. 是否完整覆盖 TASK 的显式意图，包括状态变量、显示元素、交互、时序、信号/事件和反馈。
2. 是否正确使用 ASSETS 中给定且类型匹配的资源；资源 ID 引号、空资源、幻觉资源和错误类型要扣分。
3. 是否是可执行且符合 VGE-DSL/1 语法的输出；parse_status.invalid 是事实证据，应显著扣分，但不要只因写法不同于参考 DSL 而扣分。
4. 用户需求如果涉及玩法/选择/点击/拖拽/翻牌/得分，候选应有真实可操作对象和可见反馈，而不是只改变量或只发信号。
5. 不奖励无关功能、无意义 SIGNAL、过度脑补或绕开需求。

参考 DSL 是人类关卡片段的语义锚点，不要求逐字相同；候选可以用不同 ID/顺序/实现，只要行为等价或更清晰。

只输出 JSON 对象，不要 Markdown：
{
  "winner": "A" | "B" | "tie" | "neither",
  "confidence": 0.0,
  "scores": {
    "A": {"overall": 0, "requirement_coverage": 0, "behavioral_correctness": 0, "resource_grounding": 0, "interaction_feedback": 0, "layout_presentation": 0, "syntax_executability": 0},
    "B": {"overall": 0, "requirement_coverage": 0, "behavioral_correctness": 0, "resource_grounding": 0, "interaction_feedback": 0, "layout_presentation": 0, "syntax_executability": 0}
  },
  "requirements": [{"requirement": "简短要求", "A": "met|partial|unmet|invalid|unclear", "B": "met|partial|unmet|invalid|unclear"}],
  "rationale": "简短中文结论，说明胜负关键"
}

分数 0-10；overall 是综合生产可用语义分。若一方 parse_status.invalid，syntax_executability 通常不超过 2；若两方都 invalid 但内容仍可读，可以评 neither 或按语义接近度给较低分。"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def latest_by_case(path: Path) -> dict[str, dict[str, Any]]:
    rows = read_jsonl(path)
    return {row["case_id"]: row for row in rows if isinstance(row.get("case_id"), str)}


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


def parse_json_object(text: str) -> dict[str, Any]:
    content = text.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.I)
        content = re.sub(r"\s*```$", "", content)
    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start < 0 or end <= start:
            raise
        value = json.loads(content[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("judge output is not a JSON object")
    return value


def response_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        raise ValueError("API response has no choices")
    content = (choices[0].get("message") or {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("API response has no text content")
    return content.strip()


def call_chat(config: dict[str, Any], messages: list[dict[str, str]]) -> dict[str, Any]:
    endpoint = config["api_base"].rstrip("/") + "/chat/completions"
    # Some OpenAI-compatible routers reject GPT-5's Responses-style
    # max_output_tokens. Keep this request plain chat-completions.
    payload = {
        "model": config["model"],
        "messages": messages,
        "temperature": config["temperature"],
    }
    if int(config.get("max_tokens") or 0) > 0:
        payload["max_tokens"] = config["max_tokens"]
    data = json.dumps(payload).encode("utf-8")
    retries = max(1, int(config.get("api_retries", 4)))
    backoff = float(config.get("api_retry_backoff", 1.5))
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        request = urllib.request.Request(
            endpoint,
            data=data,
            method="POST",
            headers=teacher_request_headers(config, "openai"),
        )
        try:
            with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[-800:]
            last_error = RuntimeError(f"judge API HTTP {error.code}: {detail}")
            if error.code not in {408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524} or attempt >= retries:
                raise last_error from error
        except Exception as error:
            last_error = RuntimeError(f"judge API failed: {error}")
            if attempt >= retries:
                raise last_error
        time.sleep(min(20.0, backoff * (2 ** (attempt - 1))))
    assert last_error is not None
    raise last_error


def score_value(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(0.0, min(10.0, float(value)))


def normalize_judgment(value: dict[str, Any]) -> dict[str, Any]:
    winner = str(value.get("winner") or "").strip()
    if winner not in {"A", "B", "tie", "neither"}:
        raise ValueError(f"invalid winner: {winner!r}")
    scores = value.get("scores")
    if not isinstance(scores, dict):
        raise ValueError("missing scores")
    normalized_scores: dict[str, dict[str, float]] = {}
    fields = [
        "overall", "requirement_coverage", "behavioral_correctness", "resource_grounding",
        "interaction_feedback", "layout_presentation", "syntax_executability",
    ]
    for label in ("A", "B"):
        item = scores.get(label)
        if not isinstance(item, dict):
            raise ValueError(f"missing scores.{label}")
        normalized_scores[label] = {}
        for field in fields:
            score = score_value(item.get(field))
            if score is None:
                raise ValueError(f"invalid score {label}.{field}")
            normalized_scores[label][field] = round(score, 3)
    confidence = value.get("confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        confidence = 0.0
    requirements = value.get("requirements")
    if not isinstance(requirements, list):
        requirements = []
    return {
        "winner": winner,
        "confidence": round(max(0.0, min(1.0, float(confidence))), 3),
        "scores": normalized_scores,
        "requirements": requirements,
        "rationale": str(value.get("rationale") or "").strip(),
    }


def make_candidate(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "parse_status": "valid" if isinstance(row.get("sample"), dict) and not row.get("parse_error") else "invalid",
        "parse_error": row.get("parse_error") or "",
        "raw_dsl": row.get("raw_output") or "",
    }


def prompt_for(case: dict[str, Any], left: dict[str, Any], right: dict[str, Any]) -> list[dict[str, str]]:
    payload = {
        "task": case["intent"],
        "canvas": {"width": case.get("canvas_width", 800), "height": case.get("canvas_height", 600)},
        "asset_catalog": case.get("asset_catalog", []),
        "reference_dsl": case.get("reference_dsl", ""),
        "candidate_A": left,
        "candidate_B": right,
    }
    return [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def judge_one(case: dict[str, Any], adapter: dict[str, Any], base: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    seed = int(hashlib.sha256(case["id"].encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    order = ["adapter", "base"]
    rng.shuffle(order)
    candidates = {"adapter": make_candidate(adapter), "base": make_candidate(base)}
    labels = {"A": order[0], "B": order[1]}
    started = time.monotonic()
    response = call_chat(config, prompt_for(case, candidates[labels["A"]], candidates[labels["B"]]))
    judgment = normalize_judgment(parse_json_object(response_text(response)))
    elapsed = round(time.monotonic() - started, 3)
    winner_label = judgment["winner"]
    winner_model = labels[winner_label] if winner_label in labels else winner_label
    scores_by_model = {labels[label]: judgment["scores"][label] for label in ("A", "B")}
    return {
        "case_id": case["id"],
        "category": case.get("category"),
        "labels": labels,
        "winner_label": winner_label,
        "winner_model": winner_model,
        "scores_by_model": scores_by_model,
        "adapter_parse_valid": candidates["adapter"]["parse_status"] == "valid",
        "base_parse_valid": candidates["base"]["parse_status"] == "valid",
        "judgment": judgment,
        "latency_seconds": elapsed,
        "created_at": utc_now(),
    }


def append_jsonl(path: Path, record: dict[str, Any], lock: threading.Lock) -> None:
    encoded = json.dumps(record, ensure_ascii=False) + "\n"
    with lock:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    def mean(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 3) if values else None

    summary: dict[str, Any] = {
        "total": len(records),
        "winner_counts": {},
        "parse_valid": {
            "adapter": sum(r["adapter_parse_valid"] for r in records),
            "base": sum(r["base_parse_valid"] for r in records),
            "both_valid": sum(r["adapter_parse_valid"] and r["base_parse_valid"] for r in records),
            "both_invalid": sum((not r["adapter_parse_valid"]) and (not r["base_parse_valid"]) for r in records),
        },
        "mean_overall": {},
        "by_category": {},
        "common_valid_subset": {},
    }
    for winner in ("adapter", "base", "tie", "neither"):
        summary["winner_counts"][winner] = sum(r["winner_model"] == winner for r in records)
    for model in ("adapter", "base"):
        summary["mean_overall"][model] = mean([r["scores_by_model"][model]["overall"] for r in records])
    common = [r for r in records if r["adapter_parse_valid"] and r["base_parse_valid"]]
    summary["common_valid_subset"] = {
        "total": len(common),
        "winner_counts": {winner: sum(r["winner_model"] == winner for r in common) for winner in ("adapter", "base", "tie", "neither")},
        "mean_overall": {model: mean([r["scores_by_model"][model]["overall"] for r in common]) for model in ("adapter", "base")},
    }
    for category in sorted({str(r.get("category")) for r in records}):
        group = [r for r in records if str(r.get("category")) == category]
        summary["by_category"][category] = {
            "total": len(group),
            "winner_counts": {winner: sum(r["winner_model"] == winner for r in group) for winner in ("adapter", "base", "tie", "neither")},
            "mean_overall": {model: mean([r["scores_by_model"][model]["overall"] for r in group]) for model in ("adapter", "base")},
            "parse_valid": {"adapter": sum(r["adapter_parse_valid"] for r in group), "base": sum(r["base_parse_valid"] for r in group)},
        }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Slot 3 blinded pairwise semantic judge over human-fragment results")
    parser.add_argument("--slot", type=int, default=3, choices=(1, 2, 3, 4))
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--adapter", type=Path, default=DEFAULT_ADAPTER)
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--max-tokens", type=int, default=1400)
    args = parser.parse_args()
    if not 1 <= args.workers <= 16:
        parser.error("--workers must be 1..16")
    cases_doc = json.loads(args.cases.read_text(encoding="utf-8"))
    cases = cases_doc["cases"]
    adapter = latest_by_case(args.adapter)
    base = latest_by_case(args.base)
    selected = [case for case in cases if case["id"] in adapter and case["id"] in base]
    if args.limit:
        selected = selected[: args.limit]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    judgments_path = args.output_dir / "judgments.jsonl"
    # Only successful normalized judgments count as done. Error audit rows stay
    # in the ledger but are retried on the next run.
    done = {
        row["case_id"]
        for row in read_jsonl(judgments_path)
        if isinstance(row.get("case_id"), str) and not row.get("error") and isinstance(row.get("scores_by_model"), dict)
    } if judgments_path.exists() else set()
    pending = [case for case in selected if case["id"] not in done]
    config = slot_config(args.env_file, args.slot, timeout=args.timeout, max_tokens=args.max_tokens, temperature=0)
    print(json.dumps({"selected": len(selected), "pending": len(pending), "slot": str(args.slot), "model": config["model"], "output_dir": str(args.output_dir)}, ensure_ascii=False), flush=True)
    lock = threading.Lock()
    errors = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(judge_one, case, adapter[case["id"]], base[case["id"]], config): case for case in pending}
        processed = 0
        for future in concurrent.futures.as_completed(futures):
            case = futures[future]
            try:
                record = future.result()
            except Exception as error:
                record = {"case_id": case["id"], "category": case.get("category"), "error": str(error), "created_at": utc_now()}
                errors += 1
            append_jsonl(judgments_path, record, lock)
            processed += 1
            if processed % 10 == 0 or processed == len(pending):
                print(json.dumps({"processed": processed, "pending": len(pending), "errors": errors}, ensure_ascii=False), flush=True)
    records = [row for row in read_jsonl(judgments_path) if not row.get("error")]
    summary = {
        "schema_version": "human-fragment-v1-pairwise-slot3-judge",
        "created_at": utc_now(),
        "slot": str(args.slot),
        "judge_model": config["model"],
        "candidate_identity_blinded": True,
        "reference_dsl_shared": True,
        "cases": str(args.cases),
        "adapter_results": str(args.adapter),
        "base_results": str(args.base),
        "summary": summarize(records),
        "errors": [row for row in read_jsonl(judgments_path) if row.get("error")],
    }
    (args.output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(args.output_dir), "summary": summary["summary"], "errors": len(summary["errors"])}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
