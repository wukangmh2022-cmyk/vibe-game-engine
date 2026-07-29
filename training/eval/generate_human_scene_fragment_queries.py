#!/usr/bin/env python3
"""Use Slot API calls to turn first-level DSL exports into fragment queries."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
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
from training.dsl.level_dsl import parse_program, walk_commands


DEFAULT_INPUT = ROOT / "training/eval/human_scene_first_level_dsl.md"
DEFAULT_OUTPUT_DIR = ROOT / "training/eval/generated_human_fragments/v1"
DEFAULT_ENV_FILE = DEBUGGER / ".env"
DEFAULT_CANDIDATES = ROOT / "training/eval/generated_human_fragments/candidates-v1/candidates.jsonl"

SYSTEM = """你是游戏关卡编辑器的数据合成规划器。你会看到若干个从真实人类关卡第一关切出的 DSL 片段候选，每个候选有 candidate_id、来源场景和 DSL 预览。

任务：为指定候选生成确定性高的一句话 TASK 描述，并给出能力分类。

只返回严格 JSON 对象，不输出 Markdown、解释或思考。

按输入候选从上往下处理；不要打乱顺序。

返回结构必须是：
{
  "version": "human-fragment-query-v1",
  "items": [
    {
      "id": "hfq-0001",
      "candidate_id": "cand-0001",
      "category": "开场引导|倒计时|点击反馈|拖拽归类|翻牌匹配|胜负结算|失败重试|音效动画反馈|事件联动|变量阈值判断|场景跳转|其他",
      "task": "一句中文 planner TASK。必须像训练集 query：自然语言，但明确变量名、开关名、分数名、阈值、顺序、分支、事件信号名、资源用途；禁止写 DSL 命令名、JSON、代码、参数名。",
      "why_unit": "一句话说明为什么这是一个完整行为片段"
    }
  ]
}

质量要求：
1. items 数量和 id 范围必须严格遵守用户消息里的要求。
2. 片段必须来自输入候选，不要编造不存在的游戏、资源、变量或信号。
3. TASK 只能是一句话，不能换行；它要确定性强，模型看了能还原 source_dsl 的关键行为。
4. 如果片段用到变量/开关/信号，TASK 必须写出其名字和取值/触发关系。
5. 不要输出资源清单、source_dsl、canvas、source_scene_file；这些由本地 candidate_id 补齐。
6. 能力分类从这些里面选：开场引导、倒计时、点击反馈、拖拽归类、翻牌匹配、胜负结算、失败重试、音效动画反馈、事件联动、变量阈值判断、场景跳转、其他。
7. 不要写空泛 TASK，例如“继续后续流程”“完整呈现”。每个动作都要有可对应的 DSL 行。
8. 不要包含 SCRIPT；输入中 omitted 的旧 SCRIPT 不可作为片段。
"""


def parse_json(text: str) -> dict[str, Any]:
    body = text.strip()
    if body.startswith("```"):
        body = re.sub(r"^```(?:json)?\s*", "", body, flags=re.I)
        body = re.sub(r"\s*```$", "", body)
    start = body.find("{")
    if start < 0:
        raise ValueError("API response has no JSON object")
    value, _ = json.JSONDecoder().raw_decode(body[start:])
    if not isinstance(value, dict):
        raise ValueError("API response JSON is not an object")
    return value


def response_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    content = (choices[0].get("message") or {}).get("content") if choices else None
    if not isinstance(content, str) or not content.strip():
        raise ValueError("API response has no assistant content")
    return content.strip()


def parse_markdown_resource_tables(source: str) -> dict[str, dict[str, dict[str, str]]]:
    scene_resources: dict[str, dict[str, dict[str, str]]] = {}
    current_scene: str | None = None
    for line in source.splitlines():
        match = re.match(r"- scene_file: `([^`]+)`", line)
        if match:
            current_scene = match.group(1)
            scene_resources.setdefault(current_scene, {})
            continue
        if not current_scene or not line.startswith("| "):
            continue
        cells = [cell.strip().replace("\\|", "|") for cell in line.strip().strip("|").split("|")]
        if len(cells) != 4 or cells[0] in {"id", "---"}:
            continue
        rid, kind, path, name = cells
        scene_resources[current_scene][rid] = {"id": rid, "type": kind, "path": path, "name": name}
    return scene_resources


def dsl_resource_ids(dsl: str) -> list[str]:
    parsed = parse_program(dsl)
    result: list[str] = []

    def add(value: Any) -> None:
        if isinstance(value, str) and value:
            result.append(value)

    for command in walk_commands(parsed.get("commands") or [], parsed.get("extra_events") or []):
        params = command.get("parameters") or {}
        for key in ("resourceId", "soundId", "musicId", "backResourceId", "frontResourceId", "skinId", "overlayResourceId"):
            add(params.get(key))
        ui = params.get("ui") if isinstance(params.get("ui"), dict) else {}
        add(ui.get("buttonSkinId"))
        add(ui.get("selectedSkinId"))
        animation = params.get("animation") if isinstance(params.get("animation"), dict) else {}
        for block in ("entry", "loop"):
            item = animation.get(block) if isinstance(animation.get(block), dict) else {}
            add(item.get("animId"))
    return list(dict.fromkeys(result))


def load_candidates(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def candidate_prompt(candidates: list[dict[str, Any]]) -> str:
    lines = ["候选列表："]
    for item in candidates:
        lines.append(f"- {item['candidate_id']} | {item['source_scene_file']} | {item['preview']}")
    return "\n".join(lines)


def config_for_slot(env_file: Path, slot: int, timeout: int, max_tokens: int, temperature: float) -> dict[str, Any]:
    values = read_env_file(env_file)
    merged = {**{key: value for key, value in os.environ.items() if key.startswith("VIBE_TEACHER_")}, **values}
    endpoint = next((item for item in collect_teacher_endpoints(merged) if item.get("slot") == str(slot)), None)
    if endpoint is None:
        raise ValueError(f"ENV Slot {slot} is not configured in {env_file}")
    return {
        **endpoint,
        "timeout": timeout,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "thinking": False,
        "api_retries": int(values.get("VIBE_TEACHER_API_RETRIES", "3")),
        "api_retry_backoff": float(values.get("VIBE_TEACHER_API_RETRY_BACKOFF", "1.5")),
    }


def validate_items(value: dict[str, Any], *, start: int, count: int) -> list[dict[str, Any]]:
    items = value.get("items")
    if not isinstance(items, list):
        raise ValueError("response.items must be a list")
    if len(items) != count:
        raise ValueError(f"response.items must contain exactly {count} items, got {len(items)}")
    required = {"id", "candidate_id", "category", "task", "why_unit"}
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"item {index} is not an object")
        missing = sorted(required - set(item))
        if missing:
            raise ValueError(f"item {index} missing fields: {missing}")
        expected_id = f"hfq-{start + index - 1:04d}"
        if item["id"] != expected_id:
            raise ValueError(f"item {index} id must be {expected_id}, got {item['id']!r}")
        task = str(item["task"]).strip()
        if "\n" in task or len(task) < 8:
            raise ValueError(f"item {index} task must be one non-empty sentence")
        if re.search(r"\b(VAR|IMAGE|TEXT|CLICK|SELECT|CHOICES|OPTION|WAIT|SIGNAL|AUTO|ON|DSL|JSON)\b", task, re.I):
            item["task_warning"] = "task may leak command syntax"
        item["task"] = task
        normalized.append(item)
    return normalized


def attach_assets_and_query(items: list[dict[str, Any]], source: str) -> None:
    resources_by_scene = parse_markdown_resource_tables(source)
    for item in items:
        resources = resources_by_scene.get(str(item["source_scene_file"]), {})
        assets: list[dict[str, str]] = []
        try:
            resource_ids = dsl_resource_ids(str(item["source_dsl"]))
        except Exception:
            resource_ids = []
        for rid in resource_ids:
            meta = resources.get(rid)
            if not meta or meta["type"] not in {"image", "audio", "animation", "skin"}:
                continue
            assets.append({"id": meta["id"], "type": meta["type"], "path": meta["path"]})
        item["assets"] = assets
        lines = [
            "TASK",
            str(item["task"]),
            "CANVAS " + str(item.get("canvas") or "800 600"),
            "ASSETS id | type | path",
        ]
        lines.extend(f"{asset['id']} | {asset['type']} | {asset['path']}" for asset in assets)
        item["query"] = "\n".join(lines)


def hydrate_from_candidates(items: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> list[dict[str, str]]:
    by_id = {item["candidate_id"]: item for item in candidates}
    errors: list[dict[str, str]] = []
    for item in items:
        candidate = by_id.get(str(item.get("candidate_id")))
        if not candidate:
            errors.append({"id": str(item.get("id")), "error": f"unknown candidate_id {item.get('candidate_id')}"})
            continue
        item["source_scene_file"] = candidate["source_scene_file"]
        item["source_level"] = candidate["source_level"]
        item["canvas"] = "800 600"
        item["source_dsl"] = candidate["source_dsl"]
        try:
            parse_program(item["source_dsl"])
            item["parse_ok"] = True
        except Exception as error:
            item["parse_ok"] = False
            item["parse_error"] = str(error)
            errors.append({"id": str(item.get("id")), "error": str(error)})
    return errors


def call_batch(config: dict[str, Any], batch_candidates: list[dict[str, Any]], *, start: int, count: int) -> tuple[str, list[dict[str, Any]]]:
    end = start + count - 1
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": (
            f"请只基于下面候选列表，按从上往下顺序处理 {count} 个候选。"
            f"items 必须正好 {count} 条，id 必须从 hfq-{start:04d} 到 hfq-{end:04d}。"
            "candidate_id 必须逐条对应输入候选，不要跳过、不要新增候选。不要输出资源清单或 source_dsl。\n\n" + candidate_prompt(batch_candidates)
        )},
    ]
    response = call_teacher(config, messages, use_tools=False)
    raw_text = response_text(response)
    parsed = parse_json(raw_text)
    items = validate_items(parsed, start=start, count=count)
    return raw_text, items


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--slot", type=int, default=3, choices=(1, 2, 3, 4))
    parser.add_argument("--temperature", type=float, default=0.25)
    parser.add_argument("--max-tokens", type=int, default=12000)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--total", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=20)
    args = parser.parse_args()

    source = args.input.read_text(encoding="utf-8")
    candidates = load_candidates(args.candidates)
    config = config_for_slot(args.env_file, args.slot, args.timeout, args.max_tokens, args.temperature)
    if not candidates:
        raise ValueError(f"no candidates found in {args.candidates}")
    started = datetime.now(timezone.utc).isoformat()
    items: list[dict[str, Any]] = []
    parse_errors: list[dict[str, str]] = []
    raw_parts: list[str] = []
    start = 1
    batch_index = 0
    while start <= args.total:
        batch_index += 1
        count = min(args.batch_size, args.total - start + 1)
        batch_candidates = candidates[start - 1:start - 1 + count]
        if len(batch_candidates) < count:
            batch_candidates = candidates[-count:]
        print(json.dumps({"batch": batch_index, "start": start, "count": count, "candidate_ids": [batch_candidates[0]["candidate_id"], batch_candidates[-1]["candidate_id"]]}, ensure_ascii=False), flush=True)
        raw_text, batch_items = call_batch(config, batch_candidates, start=start, count=count)
        raw_parts.append(f"\n\n===== batch {batch_index} hfq-{start:04d}..hfq-{start+count-1:04d} =====\n{raw_text}")
        items.extend(batch_items)
        start += count
    parse_errors.extend(hydrate_from_candidates(items, candidates))
    attach_assets_and_query(items, source)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = args.output_dir / "raw-response.txt"
    json_path = args.output_dir / "items.json"
    jsonl_path = args.output_dir / "items.jsonl"
    compact_path = args.output_dir / "queries.tsv"
    errors_path = args.output_dir / "parse-errors.jsonl"
    manifest_path = args.output_dir / "manifest.json"
    raw_path.write_text("\n".join(raw_parts).strip() + "\n", encoding="utf-8")
    json_path.write_text(json.dumps({"version": "human-fragment-query-v1", "items": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    with compact_path.open("w", encoding="utf-8") as handle:
        handle.write("id\tcategory\tsource_scene_file\ttask\n")
        for item in items:
            handle.write("\t".join(str(item.get(key, "")).replace("\t", " ") for key in ("id", "category", "source_scene_file", "task")) + "\n")
    with errors_path.open("w", encoding="utf-8") as handle:
        for error in parse_errors:
            handle.write(json.dumps(error, ensure_ascii=False) + "\n")
    manifest = {
        "version": "human-fragment-query-v1",
        "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "slot": str(args.slot),
        "model": config["model"],
        "input": str(args.input),
        "output_json": str(json_path),
        "output_jsonl": str(jsonl_path),
        "compact_tsv": str(compact_path),
        "parse_errors": str(errors_path),
        "raw_response": str(raw_path),
        "count": len(items),
        "parse_error_count": len(parse_errors),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
