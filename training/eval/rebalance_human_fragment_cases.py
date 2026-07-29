#!/usr/bin/env python3
"""Rebalance human fragment cases toward in-level gameplay/editing operations."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.dsl.level_dsl import parse_program, serialize_patch, walk_commands
from training.eval.generate_human_scene_fragment_queries import attach_assets_and_query


DEFAULT_INPUT = ROOT / "training/eval/generated_human_fragments/v1/items.jsonl"
DEFAULT_CANDIDATES = ROOT / "training/eval/generated_human_fragments/candidates-v1/candidates.jsonl"
DEFAULT_MARKDOWN = ROOT / "training/eval/human_scene_first_level_dsl.md"
DEFAULT_OUTPUT_DIR = ROOT / "training/eval/generated_human_fragments/v2-balanced"


DEEPSEEK_CATEGORIES = (
    "资源加载与UI初始化",
    "变量定义与状态管理",
    "事件与信号流",
    "交互与选择",
    "动画与过渡",
    "文本操作",
    "计时与倒计时",
    "音效与媒体",
    "场景与导航",
    "逻辑控制与循环",
)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def command_types(dsl: str) -> list[str]:
    parsed = parse_program(dsl)
    return [str(command.get("type") or "") for command in walk_commands(parsed.get("commands") or [], parsed.get("extra_events") or [])]


def category_for(dsl: str, task: str = "") -> str:
    types = set(command_types(dsl))
    text = task + "\n" + dsl
    if re.search(r"countdown|倒计时|WAIT 740|WAIT 1000", text, flags=re.I):
        return "计时与倒计时"
    if types & {"NEXT_LEVEL", "SCENE_REDIRECT"}:
        return "场景与导航"
    if types & {"LOOP", "BREAK", "JUMP_TO"} or "IFEXPR" in dsl:
        return "逻辑控制与循环"
    if types & {"ANIMATE_IN", "ANIMATE_OUT", "MOVE_TO", "FLIP_CARD", "FIREWORK_BURST"}:
        return "动画与过渡"
    if "SET_ELEMENT_STYLE" in types and len(types) <= 3:
        return "动画与过渡"
    if types & {"SET_DRAGGABLE", "CHECK_IN_AREA", "SET_SELECTABLE", "SHOW_CHOICES", "CHANGE_SELECTED_STATE"}:
        return "交互与选择"
    if "SET_CLICKABLE" in types:
        return "交互与选择"
    if types & {"UPDATE_TEXT", "SHOW_TEXT"} and not (types & {"SHOW_IMAGE", "SET_CLICKABLE", "SET_SELECTABLE", "SHOW_CHOICES"}):
        return "文本操作"
    if types & {"BGM_PLAY", "BGM_STOP", "SE_PLAY"} and len(types) <= 2:
        return "音效与媒体"
    if types & {"EMIT_SIGNAL"} or re.search(r"^ON |^AUTO |SIGNAL ", dsl, flags=re.M):
        return "事件与信号流"
    if types & {"IF_CONDITION", "SET_VARIABLE"}:
        return "变量定义与状态管理"
    if types & {"SHOW_IMAGE", "SHOW_TEXT"}:
        return "资源加载与UI初始化"
    return "变量定义与状态管理"


def task_for(dsl: str, category: str) -> str:
    first = dsl.splitlines()[0].strip() if dsl.strip() else ""
    quoted = re.findall(r'"([^"]{1,80})"', dsl)
    if first.startswith("BGM "):
        music = first.split()[1] if len(first.split()) > 1 else "指定背景音乐"
        return f"播放背景音乐 {music}，作为当前关卡片段的氛围音。"
    if first.startswith("SE "):
        sound = first.split()[1] if len(first.split()) > 1 else "指定音效"
        return f"播放音效 {sound}，作为玩家操作或结算反馈。"
    if first.startswith("TEXT_SET "):
        element = first.split()[1] if len(first.split()) > 1 else "文本元素"
        text = quoted[0] if quoted else "新的提示内容"
        return f"把 {element} 的显示内容更新为“{text}”。"
    if first.startswith("TEXT "):
        parts = first.split()
        element = parts[1] if len(parts) > 1 else "文本元素"
        text = quoted[0] if quoted else "提示内容"
        return f"显示 {element} 文本“{text}”，用于提示玩家当前题目或状态。"
    if first.startswith("IMAGE "):
        parts = first.split()
        element = parts[1] if len(parts) > 1 else "图片元素"
        resource = parts[2] if len(parts) > 2 else "对应图片资源"
        return f"显示图片元素 {element}，使用资源 {resource} 并保持指定位置和层级。"
    if first.startswith("STYLE "):
        element = first.split()[1] if len(first.split()) > 1 else "元素"
        return f"调整 {element} 的显示样式，用于隐藏、缩放或改变当前画面状态。"
    if first.startswith("ANIM_IN "):
        parts = first.split()
        return f"让 {parts[1] if len(parts) > 1 else '元素'} 播放内置入场动画，形成可见的出现反馈。"
    if first.startswith("ANIM_OUT "):
        parts = first.split()
        return f"让 {parts[1] if len(parts) > 1 else '元素'} 播放内置离场动画，并按需要隐藏。"
    if first.startswith("MOVE "):
        parts = first.split()
        return f"移动 {parts[1] if len(parts) > 1 else '元素'} 到指定位置，形成位置变化反馈。"
    if first.startswith("FLIP "):
        parts = first.split()
        return f"翻转 {parts[1] if len(parts) > 1 else '卡片元素'}，切换到指定背面资源。"
    if first.startswith("CLICK "):
        element = first.split()[1] if len(first.split()) > 1 else "元素"
        return f"让玩家点击 {element} 后执行片段内的反馈、状态更新或流程切换。"
    if first.startswith("SELECT "):
        element = first.split()[1] if len(first.split()) > 1 else "选项元素"
        return f"让 {element} 成为可选择项目，选中后记录状态并显示可见选中反馈。"
    if first.startswith("DRAG "):
        element = first.split()[1] if len(first.split()) > 1 else "元素"
        return f"允许玩家拖动 {element}，用于关卡内的拖拽操作。"
    if first.startswith("AREA "):
        element = first.split()[1] if len(first.split()) > 1 else "拖拽元素"
        return f"检测 {element} 是否进入指定放置区域，并根据命中结果更新状态。"
    if first.startswith("CHOICES "):
        element = first.split()[1] if len(first.split()) > 1 else "选项组"
        return f"显示 {element} 选项菜单，让玩家从候选答案中选择并触发对应分支。"
    if first.startswith("VAR "):
        parts = first.split()
        return f"更新变量 {parts[1] if len(parts) > 1 else '状态变量'}，供后续分支、计分或胜负判断使用。"
    if first.startswith("IF "):
        return "根据当前变量条件进入对应分支，执行片段内的状态更新或反馈流程。"
    if first.startswith("IFEXPR "):
        return "根据表达式条件判断当前流程是否继续、跳转或进入结算分支。"
    if first.startswith("SIGNAL "):
        signal = first.split()[1] if len(first.split()) > 1 else "指定信号"
        return f"发送 {signal} 信号，把当前片段交给对应事件流程处理。"
    if first.startswith("ON "):
        signal = first.split()[1] if len(first.split()) > 1 else "指定信号"
        return f"响应 {signal} 信号，执行该事件下的完整关卡流程。"
    if first.startswith("SCENE "):
        target = first.split()[1] if len(first.split()) > 1 else "目标场景"
        return f"跳转到 {target}，用于返回入口或重玩当前关卡。"
    if first.startswith("NEXT"):
        return "当前成功流程结束后进入下一关。"
    if first.startswith("WAIT "):
        duration = first.split()[1] if len(first.split()) > 1 else "指定时长"
        return f"等待 {duration} 毫秒，让画面或反馈保持一小段时间。"

    ids = re.findall(r"\b(?:[A-Za-z_][A-Za-z0-9_-]*|[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9_-]*)\b", dsl)
    names = [item for item in ids if item not in {"true", "false", "id", "style", "animation", "entry", "loop", "animId"}]
    hint = "、".join(dict.fromkeys(names[:5]))
    if category == "交互与选择":
        return f"围绕{hint or '当前元素'}配置关卡内交互，玩家操作后要更新状态、触发反馈或进入下一步。"
    if category == "动画与过渡":
        return f"让{hint or '当前元素'}产生可见的入场、离场、移动、翻转或样式变化效果。"
    if category == "文本操作":
        return f"显示或更新{hint or '提示文本'}，让玩家看到当前题目、状态或反馈内容。"
    if category == "场景与导航":
        return f"在{hint or '当前流程'}完成后进入下一关、返回入口或重玩本关。"
    if category == "逻辑控制与循环":
        return f"根据{hint or '当前变量'}进行条件判断或循环跳转，直到达到结束条件。"
    if category == "计时与倒计时":
        return f"维护countdown倒计时显示和等待节奏，到达条件后切换到下一段流程。"
    if category == "变量定义与状态管理":
        return f"初始化或更新{hint or '关卡状态变量'}，用于后续分支、计分或胜负判断。"
    if category == "音效与媒体":
        return f"播放{hint or '当前音效或背景音乐'}作为关卡反馈。"
    if category == "事件与信号流":
        return f"在{hint or '当前流程'}中发送或响应信号，把读题、作答和反馈流程串起来。"
    return f"显示{hint or '关卡画面元素'}，完成当前 UI 初始化。"


def useful_child_blocks(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    parsed = parse_program(candidate["source_dsl"])
    extras: list[dict[str, Any]] = []

    def add(commands: list[dict[str, Any]], suffix: str) -> None:
        if not commands:
            return
        dsl = serialize_patch({"commands": commands, "extra_events": []}).strip()
        if not dsl:
            return
        cat = category_for(dsl)
        if cat == "资源加载与UI初始化":
            return
        extras.append({
            "candidate_id": f"{candidate['candidate_id']}:{suffix}",
            "source_scene_file": candidate["source_scene_file"],
            "source_level": candidate["source_level"],
            "source_dsl": dsl,
            "category": cat,
        })

    top_commands = parsed.get("commands") or []
    for index, command in enumerate(top_commands, start=1):
        add([copy.deepcopy(command)], f"top{index}")
    for event_index, event in enumerate(parsed.get("extra_events") or [], start=1):
        event_commands = event.get("commands") or []
        for index, command in enumerate(event_commands, start=1):
            add([copy.deepcopy(command)], f"event{event_index}-cmd{index}")
        if event_commands:
            dsl = serialize_patch({"commands": [], "extra_events": [copy.deepcopy(event)]}).strip()
            cat = category_for(dsl)
            if cat != "资源加载与UI初始化":
                extras.append({
                    "candidate_id": f"{candidate['candidate_id']}:event{event_index}",
                    "source_scene_file": candidate["source_scene_file"],
                    "source_level": candidate["source_level"],
                    "source_dsl": dsl,
                    "category": cat,
                })
    return extras


TARGET_COUNTS = {
    "资源加载与UI初始化": 12,
    "变量定义与状态管理": 10,
    "事件与信号流": 10,
    "交互与选择": 22,
    "动画与过渡": 12,
    "文本操作": 12,
    "计时与倒计时": 8,
    "音效与媒体": 5,
    "场景与导航": 5,
    "逻辑控制与循环": 4,
}


def add_pool_item(pool: list[dict[str, Any]], item: dict[str, Any], seen: set[str]) -> None:
    if item["source_dsl"] in seen:
        return
    seen.add(item["source_dsl"])
    pool.append(item)


def single_command_pool(candidates: list[dict[str, Any]], seen: set[str]) -> list[dict[str, Any]]:
    pool: list[dict[str, Any]] = []
    for candidate in candidates:
        parsed = parse_program(candidate["source_dsl"])
        commands = list(walk_commands(parsed.get("commands") or [], parsed.get("extra_events") or []))
        for index, command in enumerate(commands, start=1):
            command_type = str(command.get("type") or "")
            if not command_type or command_type in {"SCRIPT"}:
                continue
            dsl = serialize_patch({"commands": [copy.deepcopy(command)], "extra_events": []}).strip()
            if not dsl or dsl in seen:
                continue
            category = category_for(dsl)
            item = {
                "candidate_id": f"{candidate['candidate_id']}:cmd{index}",
                "source_scene_file": candidate["source_scene_file"],
                "source_level": candidate["source_level"],
                "source_dsl": dsl,
                "category": category,
                "task": task_for(dsl, category),
                "canvas": "800 600",
                "why_unit": "本地从真实人类 DSL 中抽出的单一关卡能力片段。",
                "local_rebalance": True,
                "parse_ok": True,
            }
            add_pool_item(pool, item, seen)
    return pool


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--total", type=int, default=100)
    parser.add_argument("--max-resource-init", type=int, default=15)
    args = parser.parse_args()

    source_markdown = args.markdown.read_text(encoding="utf-8")
    items = load_jsonl(args.input)
    candidates = load_jsonl(args.candidates)

    pool: list[dict[str, Any]] = []
    seen_dsl: set[str] = set()
    resource_count = 0
    old_intro_count = 0
    for item in items:
        item = copy.deepcopy(item)
        item["category_v1"] = item.get("category")
        item["category"] = category_for(item["source_dsl"], item.get("task", ""))
        if item["category_v1"] == "开场引导":
            if old_intro_count >= args.max_resource_init:
                continue
            old_intro_count += 1
            if item["category"] in {"变量定义与状态管理", "音效与媒体", "事件与信号流"}:
                item["category"] = "资源加载与UI初始化"
        elif item["category"] == "资源加载与UI初始化":
            if resource_count >= args.max_resource_init:
                continue
            resource_count += 1
        add_pool_item(pool, item, seen_dsl)

    extras: list[dict[str, Any]] = []
    for candidate in candidates:
        for extra in useful_child_blocks(candidate):
            if extra["source_dsl"] in seen_dsl:
                continue
            seen_dsl.add(extra["source_dsl"])
            extra["task"] = task_for(extra["source_dsl"], extra["category"])
            extra["canvas"] = "800 600"
            extra["why_unit"] = "本地从真实人类 DSL 候选中拆出的关卡内行为片段。"
            extra["local_rebalance"] = True
            try:
                parse_program(extra["source_dsl"])
                extra["parse_ok"] = True
            except Exception as error:
                extra["parse_ok"] = False
                extra["parse_error"] = str(error)
            extras.append(extra)
    pool.extend(extras)
    pool.extend(single_command_pool(candidates, seen_dsl))

    priority = {
        "交互与选择": 0,
        "动画与过渡": 1,
        "文本操作": 2,
        "逻辑控制与循环": 3,
        "变量定义与状态管理": 4,
        "场景与导航": 5,
        "计时与倒计时": 6,
        "事件与信号流": 7,
        "音效与媒体": 8,
        "资源加载与UI初始化": 9,
    }
    pool.sort(key=lambda item: (
        0 if not item.get("local_rebalance") else 1,
        priority.get(item["category"], 99),
        item["source_scene_file"],
        item.get("candidate_id", ""),
    ))
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    for category, target in TARGET_COUNTS.items():
        for item in pool:
            if len([x for x in selected if x.get("category") == category]) >= target:
                break
            if item["source_dsl"] in selected_ids or item.get("category") != category:
                continue
            selected.append(copy.deepcopy(item))
            selected_ids.add(item["source_dsl"])
    for item in pool:
        if len(selected) >= args.total:
            break
        if item["source_dsl"] in selected_ids:
            continue
        selected.append(copy.deepcopy(item))
        selected_ids.add(item["source_dsl"])

    for index, item in enumerate(selected, start=1):
        item["id"] = f"hfq-{index:04d}"
    attach_assets_and_query(selected, source_markdown)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "items.json").write_text(json.dumps({"version": "human-fragment-query-v2-balanced", "items": selected}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (args.output_dir / "items.jsonl").open("w", encoding="utf-8") as handle:
        for item in selected:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    with (args.output_dir / "queries.tsv").open("w", encoding="utf-8") as handle:
        handle.write("id\tcategory\tsource_scene_file\ttask\n")
        for item in selected:
            handle.write("\t".join(str(item.get(key, "")).replace("\t", " ") for key in ("id", "category", "source_scene_file", "task")) + "\n")
    manifest = {
        "version": "human-fragment-query-v2-balanced",
        "source": str(args.input),
        "count": len(selected),
        "local_rebalance_count": sum(1 for item in selected if item.get("local_rebalance")),
        "local_split_count": sum(1 for item in selected if item.get("local_split")),
        "parse_error_count": sum(1 for item in selected if not item.get("parse_ok")),
        "max_resource_init": args.max_resource_init,
        "categories": {category: sum(1 for item in selected if item.get("category") == category) for category in DEEPSEEK_CATEGORIES},
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
