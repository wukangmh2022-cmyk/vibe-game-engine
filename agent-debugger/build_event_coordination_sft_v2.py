#!/usr/bin/env python3
"""Build 300 complete, statically-valid multi-event level-authoring samples.

The samples are deterministic and source-informed: real scene files provide the
available audio catalog and domain diversity, while every generated output is a
self-contained level patch that passes EventCoordinationValidator.  No teacher
API call is needed to create this corpus.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from build_command_db import ROOT as REPO_ROOT
from curriculum_plan import PREFERRED_FAMILIES
from event_coordination_validator import EventCoordinationValidator

ROOT = REPO_ROOT
SCENE_DIR = ROOT / "customer-demo" / "scene"
OUTPUT_PATH = ROOT / "training-data" / "event-coordination-sft-v2.json"

FAMILIES = [
    # These are actual complete samples, not the old 210-slot generation plan.
    ("countdown_hud", 45), ("background_audio", 35), ("ambient_animation", 35),
    ("score_feedback", 45), ("error_assist", 40), ("high_score_celebration", 30),
    ("state_transition", 25), ("three_way_coordination", 45),
]
TOPICS = [
    "图片配对", "水果分类", "路线选择", "顺序记忆", "药品整理",
    "节奏点击", "物品归位", "数字比较", "颜色识别", "工具匹配",
    "安全判断", "昆虫观察", "服药提醒", "食材记忆", "剂量配比",
]
MILESTONES = ["展示题目后", "玩家点下开始后", "第一轮作答后", "切换到下一题时", "提交本轮答案后"]


def command(id_: str, type_: str, **parameters: Any) -> dict[str, Any]:
    return {"id": id_, "type": type_, "parameters": parameters}


def event(id_: str, name: str, target: str, commands: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": id_, "name": name, "triggers": [{"type": "custom", "target": target}], "commands": commands}


def source_catalog() -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for scene_name in PREFERRED_FAMILIES:
        path = SCENE_DIR / f"{scene_name}.json"
        scene = json.loads(path.read_text(encoding="utf-8"))
        levels = scene.get("levels") or []
        if not levels:
            continue
        audios = (scene.get("resources") or {}).get("audios") or []
        audio = next((item for item in audios if isinstance(item, dict) and item.get("id") and item.get("src")), None)
        if not audio:
            continue
        catalog.append({
            "scene_file": path.relative_to(ROOT).as_posix(), "scene_family": scene_name,
            "level_id": levels[0].get("id"), "audio": {"id": audio["id"], "type": "audio", "path": audio["src"], "origin": "existing", "exists": True},
        })
    if len(catalog) != len(PREFERRED_FAMILIES):
        raise RuntimeError("each preferred source scene must expose one audio resource")
    return catalog


def identifiers(index: int) -> dict[str, str]:
    prefix = f"ecv2_{index:03d}"
    return {
        "prefix": prefix, "timer": f"timer_{index}", "score": f"score_{index}", "errors": f"errors_{index}",
        "help": f"help_shown_{index}", "phase": f"phase_{index}", "hud": f"hud_{index}",
        "score_text": f"score_text_{index}", "ambient": f"ambient_{index}",
        "timer_start": f"{prefix}_timer_start", "score_changed": f"{prefix}_score_changed",
        "error_checked": f"{prefix}_error_checked", "phase_changed": f"{prefix}_phase_changed",
        "finished": f"{prefix}_finished", "ambient_start": f"{prefix}_ambient_start",
    }


def common_spec(family: str, index: int, topic: str, ids: dict[str, str]) -> dict[str, Any]:
    return {
        "family": family,
        "variation_axes": {"topic": topic, "threshold": 2 + index % 3, "duration_seconds": 10 + index % 4 * 5},
        "acceptance": {
            "complete_level_patch": True, "command_ids_unique": True,
            "custom_signal_edges_must_match": True, "referenced_elements_created": True,
            "loops_must_have_exit_condition": True, "source_game_names_excluded_from_intent": True,
        },
    }


def countdown(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); seconds = 10 + index % 4 * 5
    return {
        "input": {"intent": f"开始{topic}题目后显示 {seconds} 秒倒计时；倒计时独立运行且主流程可以继续等待玩家操作。这个需求需要跨事件协同。", "asset_catalog": []},
        "output": {"commands": [
            command(f"{ids['prefix']}_show_hud", "SHOW_TEXT", elementId=ids["hud"], text=f"剩余 {seconds} 秒"),
            command(f"{ids['prefix']}_init_timer", "SET_VARIABLE", key=ids["timer"], op="set", value=seconds),
            command(f"{ids['prefix']}_start_timer", "EMIT_SIGNAL", signal=ids["timer_start"]),
        ], "extra_events": [event(f"{ids['prefix']}_timer_event", "独立倒计时", ids["timer_start"], [
            command(f"{ids['prefix']}_timer_loop", "LOOP", loopType="while", condition={"type": "variable", "key": ids["timer"], "operator": "gt", "value": 0}, commands=[
                command(f"{ids['prefix']}_timer_wait", "WAIT", duration=1000),
                command(f"{ids['prefix']}_timer_sub", "SET_VARIABLE", key=ids["timer"], op="sub", value=1),
                command(f"{ids['prefix']}_timer_refresh", "UPDATE_TEXT", elementId=ids["hud"], text="剩余 ${" + ids["timer"] + "} 秒"),
            ]),
        ])]},
        "task_spec": common_spec("countdown_hud", index, topic, ids), "source_evidence": source,
    }


def background_audio(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); audio = source["audio"]; fade = 200 + index % 4 * 200
    return {
        "input": {"intent": f"进入{topic}关卡时独立开始循环背景音乐，以 {fade}ms 淡入；完成当前流程后以相同速度停止，不阻塞玩家操作。这个需求需要跨事件协同。", "asset_catalog": [audio]},
        "output": {"commands": [command(f"{ids['prefix']}_finish", "EMIT_SIGNAL", signal=ids["finished"])], "extra_events": [
            {"id": f"{ids['prefix']}_music_start", "name": "关卡背景音乐", "triggers": [{"type": "auto", "start": "immediate"}], "commands": [command(f"{ids['prefix']}_play_bgm", "BGM_PLAY", musicId=audio["id"], volume=0.65 + (index % 3) * 0.1, loop=True, fadeIn=fade)]},
            event(f"{ids['prefix']}_music_stop", "完成后停止背景音乐", ids["finished"], [command(f"{ids['prefix']}_stop_bgm", "BGM_STOP", fadeOut=fade)]),
        ]},
        "task_spec": common_spec("background_audio", index, topic, ids), "source_evidence": source,
    }


def ambient_animation(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); loop_type = "hoverY" if index % 2 else "pulse"; duration = 900 + index % 4 * 300
    return {
        "input": {"intent": f"展示{topic}题目时让背景提示以 {duration}ms 周期持续{('上下悬浮' if loop_type == 'hoverY' else '呼吸')}，题目和交互仍由主流程处理。这个需求需要跨事件协同。", "asset_catalog": []},
        "output": {"commands": [
            command(f"{ids['prefix']}_show_ambient", "SHOW_TEXT", elementId=ids["ambient"], text="准备开始"),
            command(f"{ids['prefix']}_start_ambient", "EMIT_SIGNAL", signal=ids["ambient_start"]),
        ], "extra_events": [event(f"{ids['prefix']}_ambient_event", "背景循环动画", ids["ambient_start"], [
            command(f"{ids['prefix']}_animate_loop", "ANIMATE_LOOP", elementId=ids["ambient"], loopType=loop_type, duration=duration),
        ])]},
        "task_spec": common_spec("ambient_animation", index, topic, ids), "source_evidence": source,
    }


def score_feedback(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); audio = source["audio"]; delta = 5 + index % 4 * 5
    return {
        "input": {"intent": f"玩家完成一次{topic}正确操作后增加 {delta} 分；由独立事件刷新分数并播放反馈音效，主流程不等待反馈结束。这个需求需要跨事件协同。", "asset_catalog": [audio]},
        "output": {"commands": [
            command(f"{ids['prefix']}_show_score", "SHOW_TEXT", elementId=ids["score_text"], text="得分 0"),
            command(f"{ids['prefix']}_add_score", "SET_VARIABLE", key=ids["score"], op="add", value=delta),
            command(f"{ids['prefix']}_score_signal", "EMIT_SIGNAL", signal=ids["score_changed"]),
        ], "extra_events": [event(f"{ids['prefix']}_score_event", "独立分数反馈", ids["score_changed"], [
            command(f"{ids['prefix']}_refresh_score", "UPDATE_TEXT", elementId=ids["score_text"], text="得分 ${" + ids["score"] + "}"),
            command(f"{ids['prefix']}_play_score_se", "SE_PLAY", soundId=audio["id"], volume=0.8),
        ])]},
        "task_spec": common_spec("score_feedback", index, topic, ids), "source_evidence": source,
    }


def error_assist(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); threshold = 2 + index % 4; milestone = MILESTONES[index % len(MILESTONES)]
    return {
        "input": {"intent": f"{milestone}，{topic}连续答错达到 {threshold} 次后自动显示一次帮助提示；正常答题流程继续进行。这个需求需要跨事件协同。", "asset_catalog": []},
        "output": {"commands": [
            command(f"{ids['prefix']}_init_help", "SET_VARIABLE", key=ids["help"], op="set", value=False),
            command(f"{ids['prefix']}_add_error", "SET_VARIABLE", key=ids["errors"], op="add", value=1),
            command(f"{ids['prefix']}_check_error", "EMIT_SIGNAL", signal=ids["error_checked"]),
        ], "extra_events": [event(f"{ids['prefix']}_assist_event", "连续错误帮助", ids["error_checked"], [
            command(f"{ids['prefix']}_threshold_gate", "IF_CONDITION", condition={"type": "variable", "key": ids["errors"], "operator": "gte", "value": threshold}, trueCommands=[
                command(f"{ids['prefix']}_once_gate", "IF_CONDITION", condition={"type": "variable", "key": ids["help"], "operator": "eq", "value": False}, trueCommands=[
                    command(f"{ids['prefix']}_show_help", "SHOW_TEXT", elementId=f"help_{index}", text="试着先观察题目中的关键信息"),
                    command(f"{ids['prefix']}_mark_help", "SET_VARIABLE", key=ids["help"], op="set", value=True),
                ], falseCommands=[]),
            ], falseCommands=[]),
        ])]},
        "task_spec": common_spec("error_assist", index, topic, ids), "source_evidence": source,
    }


def high_score(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); threshold = 20 + index % 4 * 10; audio = source["audio"]; count = 18 + index % 4 * 6
    return {
        "input": {"intent": f"{topic}累计得分达到 {threshold} 分时独立播放庆祝音效和 {count} 个烟花粒子，主流程仍可继续。这个需求需要跨事件协同。", "asset_catalog": [audio]},
        "output": {"commands": [
            command(f"{ids['prefix']}_set_score", "SET_VARIABLE", key=ids["score"], op="set", value=threshold),
            command(f"{ids['prefix']}_score_signal", "EMIT_SIGNAL", signal=ids["score_changed"]),
        ], "extra_events": [event(f"{ids['prefix']}_celebration_event", "高分庆祝", ids["score_changed"], [
            command(f"{ids['prefix']}_celebration_gate", "IF_CONDITION", condition={"type": "variable", "key": ids["score"], "operator": "gte", "value": threshold}, trueCommands=[
                command(f"{ids['prefix']}_celebration_se", "SE_PLAY", soundId=audio["id"], volume=0.9),
                command(f"{ids['prefix']}_fireworks", "FIREWORK_BURST", x=400, y=260, count=count, life=800),
            ], falseCommands=[]),
        ])]},
        "task_spec": common_spec("high_score_celebration", index, topic, ids), "source_evidence": source,
    }


def state_transition(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); target = 2 + index % 4; milestone = MILESTONES[index % len(MILESTONES)]
    return {
        "input": {"intent": f"{milestone}，{topic}进度达到第 {target} 阶段时由独立事件检查状态，并在满足条件后进入下一关。这个需求需要跨事件协同。", "asset_catalog": []},
        "output": {"commands": [
            command(f"{ids['prefix']}_set_phase", "SET_VARIABLE", key=ids["phase"], op="set", value=target),
            command(f"{ids['prefix']}_phase_signal", "EMIT_SIGNAL", signal=ids["phase_changed"]),
        ], "extra_events": [event(f"{ids['prefix']}_transition_event", "阶段转换检查", ids["phase_changed"], [
            command(f"{ids['prefix']}_phase_gate", "IF_CONDITION", condition={"type": "variable", "key": ids["phase"], "operator": "gte", "value": target}, trueCommands=[
                command(f"{ids['prefix']}_next_level", "NEXT_LEVEL"),
            ], falseCommands=[]),
        ])]},
        "task_spec": common_spec("state_transition", index, topic, ids), "source_evidence": source,
    }


def three_way(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    ids = identifiers(index); seconds = 12 + index % 4 * 4; threshold = 10 + index % 5 * 5; audio = source["audio"]
    return {
        "input": {"intent": f"进行{topic}时主流程展示题目并记录得分；独立 {seconds} 秒倒计时每秒更新，得分达到 {threshold} 分时独立播放庆祝反馈。这个需求需要多个跨事件协同。", "asset_catalog": [audio]},
        "output": {"commands": [
            command(f"{ids['prefix']}_show_timer", "SHOW_TEXT", elementId=ids["hud"], text=f"剩余 {seconds} 秒"),
            command(f"{ids['prefix']}_show_score", "SHOW_TEXT", elementId=ids["score_text"], text="得分 0"),
            command(f"{ids['prefix']}_timer_init", "SET_VARIABLE", key=ids["timer"], op="set", value=seconds),
            command(f"{ids['prefix']}_score_set", "SET_VARIABLE", key=ids["score"], op="set", value=threshold),
            command(f"{ids['prefix']}_timer_signal", "EMIT_SIGNAL", signal=ids["timer_start"]),
            command(f"{ids['prefix']}_score_signal", "EMIT_SIGNAL", signal=ids["score_changed"]),
        ], "extra_events": [
            event(f"{ids['prefix']}_timer_event", "并行倒计时", ids["timer_start"], [
                command(f"{ids['prefix']}_timer_loop", "LOOP", loopType="while", condition={"type": "variable", "key": ids["timer"], "operator": "gt", "value": 0}, commands=[
                    command(f"{ids['prefix']}_timer_wait", "WAIT", duration=1000),
                    command(f"{ids['prefix']}_timer_sub", "SET_VARIABLE", key=ids["timer"], op="sub", value=1),
                    command(f"{ids['prefix']}_timer_refresh", "UPDATE_TEXT", elementId=ids["hud"], text="剩余 ${" + ids["timer"] + "} 秒"),
                ]),
            ]),
            event(f"{ids['prefix']}_celebration_event", "条件庆祝反馈", ids["score_changed"], [
                command(f"{ids['prefix']}_score_refresh", "UPDATE_TEXT", elementId=ids["score_text"], text="得分 ${" + ids["score"] + "}"),
                command(f"{ids['prefix']}_high_score_gate", "IF_CONDITION", condition={"type": "variable", "key": ids["score"], "operator": "gte", "value": threshold}, trueCommands=[
                    command(f"{ids['prefix']}_score_se", "SE_PLAY", soundId=audio["id"], volume=0.85),
                    command(f"{ids['prefix']}_score_fireworks", "FIREWORK_BURST", x=400, y=250, count=24, life=900),
                ], falseCommands=[]),
            ]),
        ]},
        "task_spec": common_spec("three_way_coordination", index, topic, ids), "source_evidence": source,
    }


BUILDERS = {
    "countdown_hud": countdown, "background_audio": background_audio, "ambient_animation": ambient_animation,
    "score_feedback": score_feedback, "error_assist": error_assist, "high_score_celebration": high_score,
    "state_transition": state_transition, "three_way_coordination": three_way,
}


def build() -> dict[str, Any]:
    sources = source_catalog(); examples: list[dict[str, Any]] = []
    for family, count in FAMILIES:
        for _ in range(count):
            index = len(examples) + 1; source = sources[(index - 1) % len(sources)]; topic = TOPICS[(index - 1) % len(TOPICS)]
            example = BUILDERS[family](index, topic, source)
            example["example_id"] = f"event-coordination-v2-{index:03d}"
            examples.append(example)
    if len(examples) != 300:
        raise RuntimeError(f"expected 300 examples, got {len(examples)}")
    validator = EventCoordinationValidator()
    invalid = [{"id": item["example_id"], **result} for item in examples if not (result := validator.validate(item))["valid"]]
    if invalid:
        raise RuntimeError("generated invalid event samples: " + json.dumps(invalid[:3], ensure_ascii=False))
    return {
        "schema_version": "event-coordination-sft-v2", "status": "ready_for_training_formatter",
        "purpose": "Complete, independently verifiable multi-event level patches under commands + extra_events.",
        "example_count": len(examples), "coverage": [{"family": family, "count": count} for family, count in FAMILIES],
        "validation": {"validator": "agent-debugger/event_coordination_validator.py", "all_examples_pass": True},
        "examples": examples,
    }


def main() -> int:
    document = build()
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "example_count": document["example_count"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
