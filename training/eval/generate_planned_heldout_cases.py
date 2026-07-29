#!/usr/bin/env python3
"""Generate a versioned, distribution-controlled held-out DSL benchmark.

This deliberately does *not* generate one hundred hand-written paraphrases.
Each slot has a fixed engine capability and a hidden executable oracle, while
an API produces a fresh real-user brief plus the planner-expanded TASK that
the DSL model will actually receive in the editor pipeline.

The output is stable once written.  Run base and adapter against the same
generated JSON file; never regenerate between comparison runs.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import re
import sys
import threading
import time
from collections import Counter
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


DEFAULT_ENV_FILE = DEBUGGER / ".env"
DEFAULT_OUTPUT_DIR = ROOT / "training/eval/generated_heldout/planned-v1"
OLD_BENCHMARK = Path(__file__).with_name("heldout_interaction_benchmark_v3.py")

# These categories correspond to executable runtime oracles, not merely words
# in a prompt.  The quota is intentionally explicit so a large category cannot
# accidentally dominate the benchmark just because an API prefers it.
CATEGORIES: dict[str, dict[str, str]] = {
    "click": {"contract": "展示一个核心图片，玩家点击一次后把确认状态保存下来。", "asset": "一张与主题相关的图片"},
    "drag": {"contract": "展示一个图片，玩家可以从初始位置自由拖动到指定方向。", "asset": "一张可拖动的主题图片"},
    "drop": {"contract": "玩家把主题图片拖入目标区域；首次命中保存成功，不能重复结算。", "asset": "一张可拖动的主题图片"},
    "flip": {"contract": "用两张图片做正反双面卡，自动用短过渡翻到背面并保留结果。", "asset": "同一主题的正面图和背面图"},
    "choice": {"contract": "给玩家两个文字选项；选择第一个确认选项后保存确认状态。", "asset": "不需要资源"},
    "selection": {"contract": "展示一个图片作为可选项目，玩家点选后必须有可见的选中状态。", "asset": "一张可选主题图片"},
    "presentation_sequence": {"contract": "依次显示说明文字、短暂停顿、播放提示音、展示图片，最后保存已展示状态。", "asset": "一张主题图片和一个提示音"},
    "click_event": {"contract": "展示一个图片；点击发起确认通知，由独立响应流程保存结果，主画面不阻塞。", "asset": "一张主题图片"},
    "auto_event": {"contract": "页面打开后自动准备主题内容；准备完成通知独立响应流程保存就绪状态。", "asset": "一张主题图片"},
    "complex_coordination": {"contract": "页面自动准备并记录就绪；点击发起独立确认；确认流程按就绪与否分别写入有效或无效结果。", "asset": "一张主题图片"},
}

DIFFICULTIES = {
    "basic": "只描述核心流程，不增加未实现的玩法。",
    "contextual": "带一个合理的游戏/学习场景，但每个描述动作都必须对应既定能力。",
    "precise": "明确状态名称、顺序和条件；仍然不得写 DSL 命令名。",
}

SYSTEM = """你为一个游戏关卡编辑器生成评测题。评测的模型不会直接看到玩家的随口需求；它会看到规划器扩写后的 TASK。

请严格只返回一个 JSON 对象：
{"raw_brief":"...","planner_task":"...","subject_title":"...","subject_slug":"lowercase-english-slug"}

raw_brief 是真实用户的一两句口语化需求，可以不提变量名。
planner_task 是编辑器规划器输出给 DSL 生成器的需求：用自然中文精确写清状态变量（若有）、初始化、步骤顺序、分支/事件关系、用户交互与资源用途。它不是 DSL，禁止出现任何 DSL/JSON/API/命令名、参数名、缩进或代码块。
不要添加指定行为之外的新玩法、结算、奖励、下一关、外部信号或资源。资源只描述题目给出的资源类型。subject_title 是 2-8 字中文主题名；subject_slug 是对应且唯一的英文短横线 slug。
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def append_jsonl(path: Path, value: Any, lock: threading.Lock) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with lock, path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def parse_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\\s*", "", text, flags=re.I)
        text = re.sub(r"\\s*```$", "", text)
    start = text.find("{")
    if start < 0:
        raise ValueError("response has no JSON object")
    value, _ = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(value, dict):
        raise ValueError("response JSON is not an object")
    return value


def response_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    content = (choices[0].get("message") or {}).get("content") if choices else None
    if not isinstance(content, str) or not content.strip():
        raise ValueError("API response has no assistant text")
    return content.strip()


def config_for_slot(env_file: Path, slot: int, timeout: int, max_tokens: int, temperature: float) -> dict[str, Any]:
    values = read_env_file(env_file)
    merged = {**{key: value for key, value in os.environ.items() if key.startswith("VIBE_TEACHER_")}, **values}
    endpoint = next((item for item in collect_teacher_endpoints(merged) if item.get("slot") == str(slot)), None)
    if endpoint is None:
        raise ValueError(f"ENV Slot {slot} is not fully configured in {env_file}")
    return {**endpoint, "timeout": timeout, "max_tokens": max_tokens, "temperature": temperature,
            "thinking": False, "api_retries": int(values.get("VIBE_TEACHER_API_RETRIES", "4")),
            "api_retry_backoff": float(values.get("VIBE_TEACHER_API_RETRY_BACKOFF", "1.5"))}


def load_old_module() -> Any:
    spec = importlib.util.spec_from_file_location("old_interaction_benchmark", OLD_BENCHMARK)
    if not spec or not spec.loader:
        raise RuntimeError(f"cannot load {OLD_BENCHMARK}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def slots(per_category: int) -> list[dict[str, str | int]]:
    result = []
    for category in CATEGORIES:
        for index in range(per_category):
            difficulty = list(DIFFICULTIES)[index % len(DIFFICULTIES)]
            result.append({"category": category, "index": index + 1, "difficulty": difficulty})
    return result


def prompt_for(slot: dict[str, str | int]) -> str:
    category = str(slot["category"])
    return "\n".join((
        f"能力分类：{category}",
        f"必须实现的行为契约：{CATEGORIES[category]['contract']}",
        f"可提供资源：{CATEGORIES[category]['asset']}",
        f"难度要求：{DIFFICULTIES[str(slot['difficulty'])]}",
        "生成一个此前未出现过的具体主题和自然措辞。planner_task 要完整覆盖行为契约，不能把契约中的关键步骤省略。",
    ))


def normalize_generated(value: dict[str, Any], category: str) -> dict[str, str]:
    result = {key: str(value.get(key, "")).strip() for key in ("raw_brief", "planner_task", "subject_title", "subject_slug")}
    if any(not item for item in result.values()):
        raise ValueError("missing raw_brief, planner_task, subject_title, or subject_slug")
    if len(result["raw_brief"]) > 260 or not 8 <= len(result["planner_task"]) <= 600:
        raise ValueError("brief or planner_task length is outside allowed range")
    if not re.fullmatch(r"[a-z][a-z0-9-]{2,40}", result["subject_slug"]):
        raise ValueError("subject_slug must be lowercase English kebab-case")
    banned = r"\b(VAR|IMAGE|TEXT|CLICK|SELECT|CHOICES|OPTION|WAIT|SIGNAL|AUTO|ON|SET_VARIABLE|SHOW_IMAGE|DSL|JSON|API)\b"
    if re.search(banned, result["planner_task"], flags=re.I):
        raise ValueError("planner_task leaks implementation syntax")
    if category == "choice" and ("两个" not in result["planner_task"] and "二选" not in result["planner_task"]):
        raise ValueError("choice planner_task must state the two options")
    return result


def make_case(old: Any, generated: dict[str, str], slot: dict[str, str | int], global_index: int) -> dict[str, Any]:
    category = str(slot["category"])
    slug = f"g{global_index:03d}-{generated['subject_slug']}"
    title, element = generated["subject_title"], f"generated_{global_index:03d}"
    index = ((global_index - 1) % 10) + 1
    makers = {
        "click": lambda: old.tap_case(index, slug, title, element),
        "drag": lambda: old.drag_case(index, slug, title, element),
        "drop": lambda: old.drop_case(index, slug, title, element),
        "flip": lambda: old.flip_case(index, slug, title, element),
        "click_event": lambda: old.click_event_case(index, slug, title, element),
        "selection": lambda: old.toggle_case(index, slug, title, element),
        "auto_event": lambda: old.auto_chain_case(index, slug, title, element),
        "complex_coordination": lambda: old.complex_coordination_case(index, slug, title, element),
        "choice": lambda: old.choice_case(index, slug, title),
        "presentation_sequence": lambda: old.presentation_sequence_case(index, slug, title, element),
    }
    case = makers[category]()
    case["id"] = f"planned-{category}-{global_index:03d}-{generated['subject_slug']}"
    case["intent"] = generated["planner_task"]
    case["raw_user_brief"] = generated["raw_brief"]
    case["planner_input_version"] = "v1"
    case["generation"] = {"category": category, "difficulty": slot["difficulty"], "subject_title": title, "subject_slug": generated["subject_slug"]}
    case["reference_output"]["intent"] = case["intent"]
    return case


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate controlled, planner-shaped held-out interaction cases")
    parser.add_argument("--slot", type=int, choices=(1, 2, 3, 4), default=3)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--per-category", type=int, default=10)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--temperature", type=float, default=0.9)
    parser.add_argument("--max-tokens", type=int, default=700)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.per_category <= 30 or not 1 <= args.workers <= 32:
        parser.error("--per-category must be 1..30 and --workers must be 1..32")

    config = config_for_slot(args.env_file, args.slot, args.timeout, args.max_tokens, args.temperature)
    work = slots(args.per_category)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = args.output_dir / "generation-results.jsonl"
    completed: dict[str, dict[str, Any]] = {}
    if raw_path.is_file() and not args.no_resume:
        for line in raw_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            if item.get("status") == "ok":
                completed[str(item["slot_key"])] = item
    pending = [item for item in work if f"{item['category']}:{item['index']}" not in completed]
    print(json.dumps({"selected": len(work), "pending": len(pending), "slot": args.slot, "model": config["model"], "distribution": Counter(item["category"] for item in work)}, ensure_ascii=False))
    lock = threading.Lock()
    counters: Counter[str] = Counter()

    def worker(item: dict[str, str | int]) -> None:
        slot_key = f"{item['category']}:{item['index']}"
        started = time.monotonic()
        try:
            response = call_teacher(config, [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt_for(item)}], use_tools=False)
            generated = normalize_generated(parse_json(response_text(response)), str(item["category"]))
            record = {"time": now(), "status": "ok", "slot_key": slot_key, "slot": item, "generated": generated,
                      "elapsed_sec": round(time.monotonic() - started, 3), "model": config["model"], "endpoint_slot": str(args.slot),
                      "usage": response.get("usage") or {}, "request_hash": hashlib.sha256(prompt_for(item).encode()).hexdigest()}
            append_jsonl(raw_path, record, lock)
            counters["ok"] += 1
        except Exception as error:
            append_jsonl(raw_path, {"time": now(), "status": "error", "slot_key": slot_key, "slot": item, "error": str(error)}, lock)
            counters["errors"] += 1

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(worker, item) for item in pending]
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            future.result()
            if number % 10 == 0 or number == len(futures):
                print(json.dumps({"processed": number, "total": len(futures), "counters": dict(counters)}, ensure_ascii=False))

    latest: dict[str, dict[str, Any]] = {}
    for line in raw_path.read_text(encoding="utf-8").splitlines():
        item = json.loads(line)
        if item.get("status") == "ok":
            latest[str(item["slot_key"])] = item
    missing = [item for item in work if f"{item['category']}:{item['index']}" not in latest]
    if missing:
        print(json.dumps({"ready": False, "missing": len(missing), "rerun_same_command": True}, ensure_ascii=False))
        return 2

    old = load_old_module()
    seen_slugs: set[str] = set()
    cases: list[dict[str, Any]] = []
    for global_index, item in enumerate(work, 1):
        record = latest[f"{item['category']}:{item['index']}"]
        generated = record["generated"]
        if generated["subject_slug"] in seen_slugs:
            raise SystemExit(f"duplicate generated subject_slug: {generated['subject_slug']}; regenerate this slot with --no-resume")
        seen_slugs.add(generated["subject_slug"])
        cases.append(make_case(old, generated, item, global_index))
    benchmark = {"schema_version": "vge-interaction-planned-heldout-v1", "description": "Fixed API-generated planner-shaped held-out cases. Category quotas and runtime oracles are controlled; raw briefs remain for audit only.", "system": "The runtime evaluator supplies the editor's canonical prompt guide.", "cases": cases}
    write_json(args.output_dir / "cases.json", benchmark)
    manifest = {"schema_version": "vge-interaction-planned-heldout-manifest-v1", "generated_at": now(), "case_count": len(cases), "category_counts": Counter(case["category"] for case in cases), "slot": str(args.slot), "model": config["model"], "planner_input_version": "v1", "raw_generation_log": str(raw_path), "cases": str(args.output_dir / "cases.json")}
    write_json(args.output_dir / "manifest.json", manifest)
    print(json.dumps({"ready": True, "cases": str(args.output_dir / "cases.json"), "manifest": str(args.output_dir / "manifest.json"), "category_counts": manifest["category_counts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
