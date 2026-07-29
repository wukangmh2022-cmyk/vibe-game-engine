#!/usr/bin/env python3
"""Build the design-only 300-slot curriculum for multi-event level authoring."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from curriculum_plan import PREFERRED_FAMILIES

ROOT = REPO_ROOT
OUTPUT_PATH = ROOT / "training-data" / "event-coordination-curriculum-v1.json"
SOURCE_PATH = ROOT / "training-data" / "event-coordination-sft.json"

# 90 real source-grounded examples + 210 controlled variations = 300 slots.
FAMILIES = [
    ("countdown_hud", 30, "并行倒计时/HUD", "EMIT_SIGNAL + custom event + LOOP + WAIT + UPDATE_TEXT"),
    ("background_audio", 20, "背景音乐生命周期", "BGM_PLAY/BGM_STOP with a main-flow or event lifecycle"),
    ("ambient_animation", 20, "背景动画循环", "ANIMATE_LOOP or ANIMATE_IN inside an independent event"),
    ("score_feedback", 30, "分数变化反馈", "SET_VARIABLE + SE_PLAY/UPDATE_TEXT/animation in a routed event"),
    ("error_assist", 30, "连续错误帮助", "IF_CONDITION + SHOW_TEXT/SHOW_CHOICES in a custom event"),
    ("high_score_celebration", 20, "高分庆祝", "IF_CONDITION + SE_PLAY/FIREWORK_BURST/animation"),
    ("state_transition", 20, "状态门槛跳转", "SET_VARIABLE + IF_CONDITION + JUMP_TO/NEXT_LEVEL"),
    ("three_way_coordination", 40, "主线、并行事件、条件事件协同", "main commands plus two or more extra_events linked by signals and shared state"),
]


def intent_for(family: str, index: int) -> str:
    texts = {
        "countdown_hud": "在主流程展示题目后启动独立倒计时，每秒刷新时间文本；这个需求需要跨事件协同。",
        "background_audio": "在关卡流程开始后独立管理背景音乐播放与停止，不阻塞玩家操作；这个需求需要跨事件协同。",
        "ambient_animation": "在主流程进行时让背景元素持续循环动画，不影响题目和交互；这个需求需要跨事件协同。",
        "score_feedback": "分数改变时由独立事件播放反馈音效并刷新分数显示，主流程继续执行；这个需求需要跨事件协同。",
        "error_assist": "错误次数达到阈值时自动显示帮助提示，正常作答流程不被拆散；这个需求需要跨事件协同。",
        "high_score_celebration": "得分达到门槛时自动播放庆祝反馈，主流程仍可推进；这个需求需要跨事件协同。",
        "state_transition": "更新状态后由独立事件检查门槛并决定是否跳转下一阶段；这个需求需要跨事件协同。",
        "three_way_coordination": "主流程负责题目和交互，独立倒计时与条件反馈事件同时协作；这个需求需要多个跨事件协同。",
    }
    return texts[family].replace("。", f"，变体{index + 1}。")


def main() -> int:
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    grounded = source.get("examples") or []
    if len(grounded) != 90:
        raise RuntimeError(f"expected 90 source-grounded/derived examples, found {len(grounded)}")
    slots: list[dict[str, Any]] = []
    for index, item in enumerate(grounded):
        slots.append({
            "slot_id": f"ec-{len(slots) + 1:03d}",
            "kind": "source_grounded",
            "source_example_id": item["example_id"],
            "source_scene_family": item["source_scene_family"],
            "intent": item["input"]["intent"],
            "output_contract": {"commands": "main-flow additions", "extra_events": "one or more complete EventConfig objects"},
        })
    for family, count, label, commands in FAMILIES:
        for index in range(count):
            slots.append({
                "slot_id": f"ec-{len(slots) + 1:03d}",
                "kind": "controlled_generalization",
                "focus": family,
                "label": label,
                "intent": intent_for(family, index),
                "required_engine_primitives": commands,
                "output_contract": {"commands": "required main-flow commands", "extra_events": "required complete EventConfig array"},
                "generation_constraints": [
                    "Use only current engine commands.",
                    "Do not name source games, source level numbers, or source asset paths in the intent.",
                    "extra_events must be non-empty for this slot.",
                    "Each extra event must contain id, name, triggers, and commands.",
                ],
            })
    if len(slots) != 300:
        raise RuntimeError(f"curriculum must contain 300 slots, got {len(slots)}")
    document = {
        "schema_version": "event-coordination-curriculum-v1",
        "status": "superseded_by_generated_event_coordination_sft_v2",
        "output_contract_path": "training-data/event-output-contract-v1.json",
        "source_grounded_slots": 90,
        "controlled_generalization_slots": 210,
        "total_slots": len(slots),
        "coverage": [{"focus": focus, "slots": count} for focus, count, _, _ in FAMILIES],
        "source_scene_families": PREFERRED_FAMILIES,
        "slots": slots,
    }
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "total_slots": len(slots)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
