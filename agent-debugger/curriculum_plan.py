#!/usr/bin/env python3
"""Deterministic 1000-slot curriculum for non-overlapping command synthesis batches."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from command_db import CommandDatabase, build_command_database
from command_validator import DIRECT_RUNTIME_TYPES

DEBUGGER = REPO_ROOT / "agent-debugger"
DEFAULT_PLAN_PATH = DEBUGGER / "state" / "curriculum-1000.json"
TOTAL_SLOTS = 1000
BATCH_SIZE = 100

# Keep only content-rich game families for anchoring. Entry/menu scenes are too thin.
PREFERRED_FAMILIES = [
    "记忆衣橱", "速记消除战", "药品规划家", "小笼包派对", "各就各位",
    "药片领航员", "手疾眼快", "谁知盘中餐", "瓜果分类", "顺序记忆师",
    "农具速记", "虫虫大作战", "服药小管家", "老火锅记忆", "小小药剂师",
]

# Ordered command set used by the executable corpus.
COMMAND_TYPES = sorted(DIRECT_RUNTIME_TYPES)

# Trajectory templates. Atomic is a real template, not "no plan".
TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "atomic_single",
        "sample_mode": "atomic",
        "command_count": 1,
        "shape": ["PRIMARY"],
        "intent_pattern": "只做一件事：{primary_zh}，用于当前关卡的{angle_zh}",
    },
    {
        "id": "create_wait",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SHOW_IMAGE|SHOW_TEXT", "WAIT"],
        "intent_pattern": "先展示内容，再短暂停顿，用于当前关卡的{angle_zh}",
        "prefer_primary": ["SHOW_IMAGE", "SHOW_TEXT", "WAIT"],
    },
    {
        "id": "create_move",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SHOW_IMAGE", "MOVE_TO"],
        "intent_pattern": "显示图片后把它移到目标位置，用于当前关卡的{angle_zh}",
        "prefer_primary": ["MOVE_TO", "SHOW_IMAGE"],
        "requires_image": True,
    },
    {
        "id": "create_style",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SHOW_IMAGE|SHOW_TEXT", "SET_ELEMENT_STYLE"],
        "intent_pattern": "创建元素后改样式，强调当前关卡的{angle_zh}",
        "prefer_primary": ["SET_ELEMENT_STYLE", "SHOW_IMAGE", "SHOW_TEXT"],
    },
    {
        "id": "create_update_text",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SHOW_TEXT", "UPDATE_TEXT"],
        "intent_pattern": "先出文案，再改写同一文本元素，用于当前关卡的{angle_zh}",
        "prefer_primary": ["UPDATE_TEXT", "SHOW_TEXT"],
    },
    {
        "id": "audio_wait",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SE_PLAY|BGM_PLAY", "WAIT"],
        "intent_pattern": "播放反馈音效/背景音后停顿，用于当前关卡的{angle_zh}",
        "prefer_primary": ["SE_PLAY", "BGM_PLAY", "WAIT"],
        "requires_audio": True,
    },
    {
        "id": "var_if",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SET_VARIABLE", "IF_CONDITION"],
        "intent_pattern": "先改变量，再按条件分支，服务当前关卡的{angle_zh}",
        "prefer_primary": ["IF_CONDITION", "SET_VARIABLE"],
    },
    {
        "id": "loop_break",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["LOOP[... BREAK ...]"],
        "intent_pattern": "做一个可中断循环，服务当前关卡的{angle_zh}",
        "prefer_primary": ["LOOP", "BREAK"],
    },
    {
        "id": "choices_feedback",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["SHOW_CHOICES", "SET_VARIABLE|EMIT_SIGNAL"],
        "intent_pattern": "给出选项，并在选择后写变量或发信号，用于当前关卡的{angle_zh}",
        "prefer_primary": ["SHOW_CHOICES", "SET_VARIABLE", "EMIT_SIGNAL"],
    },
    {
        "id": "score_gate",
        "sample_mode": "motif",
        "command_count": 3,
        "shape": ["SET_VARIABLE", "IF_CONDITION", "NEXT_LEVEL|SCENE_REDIRECT|JUMP_TO"],
        "intent_pattern": "更新分数/进度后检查门槛，通过则跳转，用于当前关卡的{angle_zh}",
        "prefer_primary": ["IF_CONDITION", "NEXT_LEVEL", "SCENE_REDIRECT", "JUMP_TO", "SET_VARIABLE"],
    },
    {
        "id": "reveal_sequence",
        "sample_mode": "motif",
        "command_count": 3,
        "shape": ["SHOW_IMAGE", "WAIT", "SHOW_TEXT|SE_PLAY"],
        "intent_pattern": "先展示资源，停顿，再补提示或音效，用于当前关卡的{angle_zh}",
        "prefer_primary": ["SHOW_IMAGE", "SHOW_TEXT", "SE_PLAY", "WAIT"],
        "requires_image": True,
    },
    {
        "id": "signal_redirect",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["EMIT_SIGNAL", "SCENE_REDIRECT|NEXT_LEVEL"],
        "intent_pattern": "先发信号再切场景/下一关，用于当前关卡的{angle_zh}",
        "prefer_primary": ["EMIT_SIGNAL", "SCENE_REDIRECT", "NEXT_LEVEL"],
    },
    {
        "id": "bgm_lifecycle",
        "sample_mode": "motif",
        "command_count": 2,
        "shape": ["BGM_PLAY", "BGM_STOP|WAIT"],
        "intent_pattern": "管理背景音乐启停，用于当前关卡的{angle_zh}",
        "prefer_primary": ["BGM_PLAY", "BGM_STOP"],
        "requires_audio": True,
    },
    {
        "id": "move_style",
        "sample_mode": "motif",
        "command_count": 3,
        "shape": ["SHOW_IMAGE", "MOVE_TO", "SET_ELEMENT_STYLE"],
        "intent_pattern": "创建图片，移动，再改样式，形成短动画轨迹，用于当前关卡的{angle_zh}",
        "prefer_primary": ["MOVE_TO", "SET_ELEMENT_STYLE", "SHOW_IMAGE"],
        "requires_image": True,
    },
    {
        "id": "text_then_choice",
        "sample_mode": "motif",
        "command_count": 3,
        "shape": ["SHOW_TEXT", "WAIT", "SHOW_CHOICES"],
        "intent_pattern": "先提示，停顿，再出选项，用于当前关卡的{angle_zh}",
        "prefer_primary": ["SHOW_CHOICES", "SHOW_TEXT", "WAIT"],
    },
    {
        "id": "atomic_flow",
        "sample_mode": "atomic",
        "command_count": 1,
        "shape": ["PRIMARY"],
        "intent_pattern": "在当前关卡完成{angle_zh}相关的单步{primary_zh}",
    },
]

ANGLES = [
    ("tutorial_hint", "新手引导提示"),
    ("correct_feedback", "答对反馈"),
    ("wrong_feedback", "答错反馈"),
    ("progress_update", "进度刷新"),
    ("timer_beat", "计时节拍"),
    ("level_clear", "通关结算"),
    ("retry_path", "重试路径"),
    ("resource_reveal", "资源揭示"),
    ("focus_shift", "焦点切换"),
    ("score_change", "分数变化"),
    ("choice_branch", "分支选择"),
    ("ambient_loop", "环境循环"),
    ("transition_out", "离场过渡"),
    ("state_sync", "状态同步"),
    ("hint_refresh", "提示刷新"),
    ("combo_celebrate", "连击庆祝"),
]

PRIMARY_ZH = {
    "SHOW_IMAGE": "显示图片",
    "SHOW_TEXT": "显示文本",
    "UPDATE_TEXT": "更新文本",
    "SET_ELEMENT_STYLE": "设置元素样式",
    "MOVE_TO": "移动元素",
    "WAIT": "等待",
    "SET_VARIABLE": "设置变量",
    "IF_CONDITION": "条件判断",
    "SHOW_CHOICES": "显示选项",
    "SE_PLAY": "播放音效",
    "BGM_PLAY": "播放背景音乐",
    "BGM_STOP": "停止背景音乐",
    "EMIT_SIGNAL": "发送信号",
    "JUMP_TO": "跳转命令",
    "LOOP": "循环",
    "BREAK": "跳出循环",
    "NEXT_LEVEL": "进入下一关",
    "SCENE_REDIRECT": "场景跳转",
}


def _scene_family(level_key: str) -> str:
    match = re.match(r"scene/([^./]+)", level_key)
    return match.group(1) if match else "unknown"


def load_level_anchors(database: CommandDatabase) -> list[dict[str, Any]]:
    connection = database.connect()
    rows = connection.execute(
        "SELECT level_key, level_name, COUNT(*) AS n FROM commands GROUP BY 1, 2 ORDER BY n DESC"
    ).fetchall()
    by_family: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        family = _scene_family(row["level_key"])
        metadata = database.level_metadata(row["level_key"])
        resources = metadata.get("resources") or []
        images = sum(1 for item in resources if isinstance(item, dict) and item.get("type") == "image")
        audios = sum(1 for item in resources if isinstance(item, dict) and item.get("type") == "audio")
        by_family.setdefault(family, []).append(
            {
                "level_key": row["level_key"],
                "level_name": row["level_name"],
                "command_count": row["n"],
                "image_count": images,
                "audio_count": audios,
            }
        )
    anchors: list[dict[str, Any]] = []
    for family in PREFERRED_FAMILIES:
        levels = by_family.get(family) or []
        if not levels:
            continue
        levels = sorted(levels, key=lambda item: (-item["image_count"], -item["audio_count"], -item["command_count"]))
        best = levels[0]
        anchors.append({"family": family, **best})
    if not anchors:
        raise RuntimeError("no preferred scene families found in command database")
    return anchors


def _pick_template(slot: int, primary: str, anchor: dict[str, Any]) -> dict[str, Any]:
    # About 55% motif overall: even slots prefer motif-capable templates.
    candidates = []
    for template in TEMPLATES:
        prefer = template.get("prefer_primary")
        if prefer and primary not in prefer and template["sample_mode"] == "motif":
            # still allow if primary is BREAK inside loop template etc.
            if primary == "BREAK" and template["id"] == "loop_break":
                pass
            elif primary not in prefer:
                continue
        if template.get("requires_image") and anchor["image_count"] < 1:
            continue
        if template.get("requires_audio") and anchor["audio_count"] < 1:
            continue
        if template["sample_mode"] == "atomic" and primary in {"MOVE_TO", "UPDATE_TEXT", "SET_ELEMENT_STYLE", "BREAK"}:
            # These must be motifs in the synthesizer contract.
            continue
        candidates.append(template)
    if not candidates:
        candidates = [item for item in TEMPLATES if item["sample_mode"] == "atomic"]
    # Force required motif primaries into motif templates.
    if primary in {"MOVE_TO", "UPDATE_TEXT", "SET_ELEMENT_STYLE", "BREAK"}:
        motif_candidates = [item for item in candidates if item["sample_mode"] == "motif"]
        if motif_candidates:
            candidates = motif_candidates
    # Prefer motif on most slots for trajectory practice.
    if slot % 5 != 0:
        motif_candidates = [item for item in candidates if item["sample_mode"] == "motif"]
        if motif_candidates:
            candidates = motif_candidates
    else:
        atomic_candidates = [item for item in candidates if item["sample_mode"] == "atomic"]
        if atomic_candidates:
            candidates = atomic_candidates
    return candidates[slot % len(candidates)]


def _supporting_commands(primary: str, template: dict[str, Any]) -> list[str]:
    shape = template.get("shape") or ["PRIMARY"]
    support: list[str] = []
    for token in shape:
        if token == "PRIMARY":
            continue
        if token.startswith("LOOP"):
            support.extend(["LOOP", "BREAK"] if primary != "LOOP" else ["BREAK"])
            continue
        options = token.split("|")
        chosen = options[0]
        for option in options:
            if option == primary:
                chosen = option
                break
        if chosen != primary and chosen not in support:
            support.append(chosen)
    # Ensure element creators for dependent primaries.
    if primary in {"MOVE_TO", "SET_ELEMENT_STYLE"} and "SHOW_IMAGE" not in support and primary != "SHOW_IMAGE":
        support.insert(0, "SHOW_IMAGE")
    if primary == "UPDATE_TEXT" and "SHOW_TEXT" not in support:
        support.insert(0, "SHOW_TEXT")
    if primary == "BREAK" and "LOOP" not in support:
        support.insert(0, "LOOP")
    return support[:3]


def build_curriculum(database: CommandDatabase, total: int = TOTAL_SLOTS) -> dict[str, Any]:
    anchors = load_level_anchors(database)
    slots: list[dict[str, Any]] = []
    for slot in range(total):
        batch_id = slot // BATCH_SIZE
        batch_index = slot % BATCH_SIZE
        # Coprime-ish strides keep types/families spread inside and across batches.
        primary = COMMAND_TYPES[(slot * 7 + batch_id * 3) % len(COMMAND_TYPES)]
        anchor = anchors[(slot * 3 + batch_id) % len(anchors)]
        # For audio-only primaries, prefer audio-rich anchors when available.
        if primary in {"SE_PLAY", "BGM_PLAY", "BGM_STOP"}:
            audio_anchors = [item for item in anchors if item["audio_count"] > 0]
            if audio_anchors:
                anchor = audio_anchors[(slot * 5 + batch_id) % len(audio_anchors)]
        if primary in {"SHOW_IMAGE", "MOVE_TO"}:
            image_anchors = [item for item in anchors if item["image_count"] > 0]
            if image_anchors:
                anchor = image_anchors[(slot * 5 + batch_id) % len(image_anchors)]
        template = _pick_template(slot, primary, anchor)
        angle_id, angle_zh = ANGLES[(slot * 11 + batch_id * 2) % len(ANGLES)]
        primary_zh = PRIMARY_ZH.get(primary, primary)
        intent_seed = template["intent_pattern"].format(
            primary_zh=primary_zh,
            scene_zh=anchor["family"],
            angle_zh=angle_zh,
        )
        support = _supporting_commands(primary, template)
        # Unique lattice key guarantees batch0 vs later batches never share the same plan cell.
        lattice_key = "|".join(
            [
                f"s{slot:04d}",
                f"b{batch_id:02d}",
                primary,
                template["id"],
                anchor["family"],
                angle_id,
                str(template["command_count"]),
            ]
        )
        plan_fingerprint = hashlib.sha1(lattice_key.encode("utf-8")).hexdigest()[:16]
        slots.append(
            {
                "slot": slot,
                "plan_id": f"g{slot:04d}",
                "batch_id": batch_id,
                "batch_index": batch_index,
                "primary_command_type": primary,
                "sample_mode": template["sample_mode"],
                "template_id": template["id"],
                "command_count": template["command_count"],
                "shape": template["shape"],
                "supporting_command_types": support,
                "scene_family": anchor["family"],
                "level_key": anchor["level_key"],
                "level_name": anchor["level_name"],
                "angle_id": angle_id,
                "angle_zh": angle_zh,
                "intent_seed": intent_seed,
                "diversity_constraints": {
                    "must_use_level_key": anchor["level_key"],
                    "must_include_primary": primary,
                    "must_follow_template": template["id"],
                    "avoid_generic_intents": True,
                    "unique_plan_id": f"g{slot:04d}",
                },
                "lattice_key": lattice_key,
                "plan_fingerprint": plan_fingerprint,
            }
        )
    return {
        "schema_version": "curriculum-v1",
        "total_slots": total,
        "batch_size": BATCH_SIZE,
        "command_types": COMMAND_TYPES,
        "scene_families": [item["family"] for item in anchors],
        "templates": [item["id"] for item in TEMPLATES],
        "angles": [item[0] for item in ANGLES],
        "slots": slots,
    }


def save_curriculum(plan: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_curriculum(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def slice_plan(plan: dict[str, Any], offset: int, count: int) -> list[dict[str, Any]]:
    slots = plan["slots"]
    if offset < 0 or count < 1 or offset >= len(slots):
        raise ValueError(f"invalid plan slice offset={offset} count={count} total={len(slots)}")
    end = min(len(slots), offset + count)
    return slots[offset:end]


def sample_fingerprint(sample: dict[str, Any], primary: str = "", template_id: str = "") -> str:
    """Structural fingerprint for near-duplicate rejection across the full 1000-slot corpus."""

    def walk(commands: list[Any]) -> list[str]:
        parts: list[str] = []
        for command in commands:
            if not isinstance(command, dict):
                continue
            command_type = str(command.get("type", "")).upper()
            parameters = command.get("parameters") if isinstance(command.get("parameters"), dict) else {}
            keys = ",".join(sorted(str(key) for key in parameters.keys()))
            nested = []
            for value in parameters.values():
                if isinstance(value, list) and value and isinstance(value[0], dict) and "type" in value[0]:
                    nested.extend(walk(value))
                elif isinstance(value, dict) and isinstance(value.get("commands"), list):
                    nested.extend(walk(value["commands"]))
            part = f"{command_type}{{{keys}}}"
            if nested:
                part += "[" + ";".join(nested) + "]"
            parts.append(part)
        return parts

    intent = re.sub(r"\s+", "", str(sample.get("intent", "")))
    commands = sample.get("commands") if isinstance(sample.get("commands"), list) else []
    skeleton = ">".join(walk(commands))
    payload = f"{primary}|{template_id}|{intent}|{skeleton}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build deterministic 1000-slot synthesis curriculum")
    parser.add_argument("--project", default=str(REPO_ROOT / "customer-demo"))
    parser.add_argument("--output", default=str(DEFAULT_PLAN_PATH))
    parser.add_argument("--total", type=int, default=TOTAL_SLOTS)
    parser.add_argument("--print-slice", nargs=2, type=int, metavar=("OFFSET", "COUNT"))
    args = parser.parse_args()
    database_path = DEBUGGER / "state" / "command-index.sqlite"
    build_command_database(Path(args.project), database_path)
    plan = build_curriculum(CommandDatabase(database_path), total=args.total)
    path = save_curriculum(plan, Path(args.output))
    summary = {
        "output": str(path),
        "total_slots": plan["total_slots"],
        "batch_size": plan["batch_size"],
        "scene_families": plan["scene_families"],
        "command_types": len(plan["command_types"]),
        "templates": plan["templates"],
    }
    if args.print_slice:
        offset, count = args.print_slice
        summary["slice"] = slice_plan(plan, offset, count)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
