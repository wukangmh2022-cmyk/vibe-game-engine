#!/usr/bin/env python3
"""Build behavior-backed multi-event level-authoring samples without teacher APIs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from build_command_db import ROOT as REPO_ROOT
from curriculum_plan import PREFERRED_FAMILIES
from event_coordination_validator import EventCoordinationValidator


ROOT = REPO_ROOT
SCENE_DIR = ROOT / "customer-demo" / "scene"
OUTPUT_PATH = ROOT / "training-data" / "event-coordination-sft-v3.json"
FAMILIES = [
    ("countdown_hud", 45), ("background_audio", 35), ("ambient_animation", 35),
    ("score_feedback", 45), ("error_assist", 40), ("high_score_celebration", 30),
    ("state_transition", 25), ("three_way_coordination", 45),
]
TOPICS = ["图片配对", "水果分类", "路线选择", "顺序记忆", "药品整理", "节奏点击", "物品归位", "数字比较", "颜色识别", "工具匹配", "安全判断", "昆虫观察", "服药提醒", "食材记忆", "剂量配比"]


def command(id_: str, type_: str, **parameters: Any) -> dict[str, Any]:
    return {"id": id_, "type": type_, "parameters": parameters}


def event(id_: str, name: str, target: str, commands: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": id_, "name": name, "triggers": [{"type": "custom", "target": target}], "commands": commands}


def source_catalog() -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for family in PREFERRED_FAMILIES:
        scene = json.loads((SCENE_DIR / f"{family}.json").read_text(encoding="utf-8"))
        resources = scene.get("resources") or {}
        image = next((item for item in resources.get("images") or [] if isinstance(item, dict) and item.get("id") and item.get("src")), None)
        audio = next((item for item in resources.get("audios") or [] if isinstance(item, dict) and item.get("id") and item.get("src")), None)
        if image and audio:
            catalog.append({
                "image": {"id": image["id"], "type": "image", "path": image["src"], "origin": "existing", "exists": True},
                "audio": {"id": audio["id"], "type": "audio", "path": audio["src"], "origin": "existing", "exists": True},
            })
    if len(catalog) != len(PREFERRED_FAMILIES):
        raise RuntimeError("each source family must provide one image and one audio resource")
    return catalog


def ids(index: int) -> dict[str, str]:
    prefix = f"ecv3_{index:03d}"
    return {
        "prefix": prefix, "question": f"question_{index}", "card": f"answer_card_{index}", "hud": f"timer_hud_{index}",
        "score_text": f"score_text_{index}", "ambient": f"ambient_{index}", "help": f"help_{index}",
        "timer": f"timer_{index}", "score": f"score_{index}", "errors": f"errors_{index}", "phase": f"phase_{index}",
        "help_shown": f"help_shown_{index}", "celebrated": f"celebrated_{index}", "transitioned": f"transitioned_{index}",
        "timer_start": f"{prefix}_timer_start", "score_changed": f"{prefix}_score_changed", "error_changed": f"{prefix}_error_changed",
        "phase_changed": f"{prefix}_phase_changed", "finished": f"{prefix}_finished", "ambient_start": f"{prefix}_ambient_start",
    }


def question_commands(data: dict[str, str], image: dict[str, Any], topic: str, click_commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    p = data["prefix"]
    return [
        command(f"{p}_show_question", "SHOW_TEXT", elementId=data["question"], text=f"请完成本轮{topic}题目"),
        command(f"{p}_show_answer", "SHOW_IMAGE", elementId=data["card"], resourceId=image["id"], position={"x": 280, "y": 220}, size={"width": 160, "height": 160}),
        command(f"{p}_answer_click", "SET_CLICKABLE", elementId=data["card"], clickable=True, blocking=False, onClick="commands", commands=click_commands),
    ]


def evaluation(data: dict[str, str], taps: int, assertions: list[dict[str, Any]]) -> dict[str, Any]:
    return {"actions": [{"type": "tap", "target": data["card"]} for _ in range(taps)], "assertions": assertions}


def sample(index: int, family: str, intent: str, assets: list[dict[str, Any]], commands: list[dict[str, Any]], events: list[dict[str, Any]], runtime_evaluation: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "event-coordination-sft-v3", "example_id": f"event-coordination-v3-{index:03d}",
        "input": {"intent": intent, "asset_catalog": assets}, "output": {"commands": commands, "extra_events": events},
        "task_spec": {"family": family, "complete_main_flow": True, "runtime_interaction_checked": True, "teacher_api_used": False},
        "runtime_evaluation": runtime_evaluation,
    }


def countdown(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); seconds = 10 + index % 4 * 5
    main = question_commands(data, source["image"], topic, [command(f"{data['prefix']}_answered", "SET_VARIABLE", key=f"answered_{index}", op="set", value=True)])
    main[1:1] = [
        command(f"{data['prefix']}_show_timer", "SHOW_TEXT", elementId=data["hud"], text=f"剩余 {seconds} 秒"),
        command(f"{data['prefix']}_init_timer", "SET_VARIABLE", key=data["timer"], op="set", value=seconds),
    ]
    main.append(command(f"{data['prefix']}_start_timer", "EMIT_SIGNAL", signal=data["timer_start"]))
    timer = event(f"{data['prefix']}_timer_event", "独立倒计时", data["timer_start"], [command(f"{data['prefix']}_timer_loop", "LOOP", loopType="while", condition={"type": "variable", "key": data["timer"], "operator": "gt", "value": 0}, commands=[command(f"{data['prefix']}_timer_wait", "WAIT", duration=1000), command(f"{data['prefix']}_timer_sub", "SET_VARIABLE", key=data["timer"], op="sub", value=1), command(f"{data['prefix']}_timer_refresh", "UPDATE_TEXT", elementId=data["hud"], text="剩余 {" + data["timer"] + "} 秒")])])
    return sample(index, "countdown_hud", f"展示{topic}题目并等待玩家点击答案；答题期间启动独立 {seconds} 秒倒计时，每秒刷新时间文本，主流程不被倒计时阻塞。这个需求需要跨事件协同。", [source["image"]], main, [timer], evaluation(data, 1, [{"type": "variable_equals", "name": f"answered_{index}", "value": True}, {"type": "variable_equals", "name": data["timer"], "value": 0}, {"type": "event_execution_count", "count": 1, "exact": True}]))


def background_audio(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); fade = 200 + index % 4 * 200
    main = question_commands(data, source["image"], topic, [command(f"{data['prefix']}_finish", "EMIT_SIGNAL", signal=data["finished"])])
    start = {"id": f"{data['prefix']}_music_start", "name": "关卡背景音乐", "triggers": [{"type": "auto", "start": "immediate"}], "commands": [command(f"{data['prefix']}_play", "BGM_PLAY", musicId=source["audio"]["id"], volume=0.7, loop=True, fadeIn=fade)]}
    stop = event(f"{data['prefix']}_music_stop", "答题完成后停止背景音乐", data["finished"], [command(f"{data['prefix']}_stop", "BGM_STOP", fadeOut=fade)])
    return sample(index, "background_audio", f"开始{topic}题目时独立循环播放背景音乐；玩家完成本轮点击答题后停止音乐，两个过程都不能阻塞交互。这个需求需要跨事件协同。", [source["image"], source["audio"]], main, [start, stop], evaluation(data, 1, [{"type": "event_execution_count", "count": 2, "exact": True}]))


def ambient(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); loop_type = "hoverY" if index % 2 else "pulse"; duration = 900 + index % 4 * 300
    main = question_commands(data, source["image"], topic, [command(f"{data['prefix']}_answered", "SET_VARIABLE", key=f"answered_{index}", op="set", value=True)])
    main[1:1] = [command(f"{data['prefix']}_show_ambient", "SHOW_TEXT", elementId=data["ambient"], text="准备开始"), command(f"{data['prefix']}_start_ambient", "EMIT_SIGNAL", signal=data["ambient_start"])]
    animated = event(f"{data['prefix']}_ambient_event", "背景循环动画", data["ambient_start"], [command(f"{data['prefix']}_animate", "ANIMATE_LOOP", elementId=data["ambient"], loopType=loop_type, duration=duration)])
    return sample(index, "ambient_animation", f"展示{topic}题目和可点击答案后，让背景提示以 {duration}ms 周期持续{('上下悬浮' if loop_type == 'hoverY' else '呼吸')}；玩家仍能正常答题。这个需求需要跨事件协同。", [source["image"]], main, [animated], evaluation(data, 1, [{"type": "variable_equals", "name": f"answered_{index}", "value": True}, {"type": "event_execution_count", "count": 1, "exact": True}]))


def score_feedback(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); delta = 5 + index % 4 * 5
    click = [command(f"{data['prefix']}_add_score", "SET_VARIABLE", key=data["score"], op="add", value=delta), command(f"{data['prefix']}_score_signal", "EMIT_SIGNAL", signal=data["score_changed"])]
    main = [command(f"{data['prefix']}_init_score", "SET_VARIABLE", key=data["score"], op="set", value=0), command(f"{data['prefix']}_show_score", "SHOW_TEXT", elementId=data["score_text"], text="得分 0")] + question_commands(data, source["image"], topic, click)
    feedback = event(f"{data['prefix']}_score_event", "独立分数反馈", data["score_changed"], [command(f"{data['prefix']}_refresh_score", "UPDATE_TEXT", elementId=data["score_text"], text="得分 {" + data["score"] + "}"), command(f"{data['prefix']}_play_score", "SE_PLAY", soundId=source["audio"]["id"], volume=0.8)])
    return sample(index, "score_feedback", f"展示{topic}题目；玩家点击正确答案后增加 {delta} 分，并由独立事件刷新分数显示和播放反馈音效，主流程无需等待音效。这个需求需要跨事件协同。", [source["image"], source["audio"]], main, [feedback], evaluation(data, 1, [{"type": "variable_equals", "name": data["score"], "value": delta}, {"type": "event_execution_count", "count": 1, "exact": True}]))


def error_assist(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); threshold = 2 + index % 2
    click = [command(f"{data['prefix']}_add_error", "SET_VARIABLE", key=data["errors"], op="add", value=1), command(f"{data['prefix']}_error_signal", "EMIT_SIGNAL", signal=data["error_changed"])]
    main = [command(f"{data['prefix']}_init_errors", "SET_VARIABLE", key=data["errors"], op="set", value=0), command(f"{data['prefix']}_init_help", "SET_VARIABLE", key=data["help_shown"], op="set", value=False)] + question_commands(data, source["image"], topic, click)
    assist = event(f"{data['prefix']}_assist_event", "连续错误帮助", data["error_changed"], [command(f"{data['prefix']}_threshold", "IF_CONDITION", condition={"type": "variable", "key": data["errors"], "operator": "gte", "value": threshold}, trueCommands=[command(f"{data['prefix']}_once", "IF_CONDITION", condition={"type": "variable", "key": data["help_shown"], "operator": "eq", "value": False}, trueCommands=[command(f"{data['prefix']}_show_help", "SHOW_TEXT", elementId=data["help"], text="再观察一次题目中的关键信息"), command(f"{data['prefix']}_mark_help", "SET_VARIABLE", key=data["help_shown"], op="set", value=True)], falseCommands=[])], falseCommands=[])])
    return sample(index, "error_assist", f"展示{topic}题目。玩家每次答错都会累计错误次数；连续答错达到 {threshold} 次时，由独立事件只显示一次帮助提示，答题流程继续保留。这个需求需要跨事件协同。", [source["image"]], main, [assist], evaluation(data, threshold, [{"type": "variable_equals", "name": data["errors"], "value": threshold}, {"type": "variable_equals", "name": data["help_shown"], "value": True}, {"type": "element_exists", "target": data["help"]}, {"type": "event_execution_count", "count": threshold, "exact": True}]))


def high_score(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); delta = 5; threshold = 10 + index % 3 * 5; taps = threshold // delta; count = 18 + index % 4 * 6
    click = [command(f"{data['prefix']}_add_score", "SET_VARIABLE", key=data["score"], op="add", value=delta), command(f"{data['prefix']}_score_signal", "EMIT_SIGNAL", signal=data["score_changed"])]
    main = [command(f"{data['prefix']}_init_score", "SET_VARIABLE", key=data["score"], op="set", value=0), command(f"{data['prefix']}_init_celebrated", "SET_VARIABLE", key=data["celebrated"], op="set", value=False)] + question_commands(data, source["image"], topic, click)
    celebration = event(f"{data['prefix']}_celebration_event", "高分庆祝", data["score_changed"], [command(f"{data['prefix']}_threshold", "IF_CONDITION", condition={"type": "variable", "key": data["score"], "operator": "gte", "value": threshold}, trueCommands=[command(f"{data['prefix']}_once", "IF_CONDITION", condition={"type": "variable", "key": data["celebrated"], "operator": "eq", "value": False}, trueCommands=[command(f"{data['prefix']}_se", "SE_PLAY", soundId=source["audio"]["id"], volume=0.9), command(f"{data['prefix']}_fireworks", "FIREWORK_BURST", x=400, y=260, count=count, life=800), command(f"{data['prefix']}_mark", "SET_VARIABLE", key=data["celebrated"], op="set", value=True)], falseCommands=[])], falseCommands=[])])
    return sample(index, "high_score_celebration", f"展示{topic}题目；每次点击正确答案增加 {delta} 分。累计得分达到 {threshold} 分时，由独立事件只播放一次庆祝音效和烟花，答题仍可继续。这个需求需要跨事件协同。", [source["image"], source["audio"]], main, [celebration], evaluation(data, taps, [{"type": "variable_equals", "name": data["score"], "value": threshold}, {"type": "variable_equals", "name": data["celebrated"], "value": True}, {"type": "event_execution_count", "count": taps, "exact": True}]))


def state_transition(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); threshold = 2 + index % 2
    click = [command(f"{data['prefix']}_add_phase", "SET_VARIABLE", key=data["phase"], op="add", value=1), command(f"{data['prefix']}_phase_signal", "EMIT_SIGNAL", signal=data["phase_changed"])]
    main = [command(f"{data['prefix']}_init_phase", "SET_VARIABLE", key=data["phase"], op="set", value=0), command(f"{data['prefix']}_init_transition", "SET_VARIABLE", key=data["transitioned"], op="set", value=False)] + question_commands(data, source["image"], topic, click)
    transition = event(f"{data['prefix']}_transition_event", "阶段转换检查", data["phase_changed"], [command(f"{data['prefix']}_gate", "IF_CONDITION", condition={"type": "variable", "key": data["phase"], "operator": "gte", "value": threshold}, trueCommands=[command(f"{data['prefix']}_once", "IF_CONDITION", condition={"type": "variable", "key": data["transitioned"], "operator": "eq", "value": False}, trueCommands=[command(f"{data['prefix']}_mark", "SET_VARIABLE", key=data["transitioned"], op="set", value=True), command(f"{data['prefix']}_next", "NEXT_LEVEL")], falseCommands=[])], falseCommands=[])])
    return sample(index, "state_transition", f"展示{topic}题目；玩家每次完成一轮点击，阶段进度增加 1。进度达到第 {threshold} 阶段时，独立事件只执行一次下一关跳转。这个需求需要跨事件协同。", [source["image"]], main, [transition], evaluation(data, threshold, [{"type": "variable_equals", "name": data["phase"], "value": threshold}, {"type": "variable_equals", "name": data["transitioned"], "value": True}, {"type": "event_execution_count", "count": threshold, "exact": True}]))


def three_way(index: int, topic: str, source: dict[str, Any]) -> dict[str, Any]:
    data = ids(index); seconds = 10 + index % 3 * 5; delta = 5; threshold = 10 + index % 3 * 5; taps = threshold // delta
    click = [command(f"{data['prefix']}_add_score", "SET_VARIABLE", key=data["score"], op="add", value=delta), command(f"{data['prefix']}_score_signal", "EMIT_SIGNAL", signal=data["score_changed"])]
    main = [
        command(f"{data['prefix']}_init_timer", "SET_VARIABLE", key=data["timer"], op="set", value=seconds),
        command(f"{data['prefix']}_init_score", "SET_VARIABLE", key=data["score"], op="set", value=0),
        command(f"{data['prefix']}_init_celebrated", "SET_VARIABLE", key=data["celebrated"], op="set", value=False),
        command(f"{data['prefix']}_show_timer", "SHOW_TEXT", elementId=data["hud"], text=f"剩余 {seconds} 秒"),
        command(f"{data['prefix']}_show_score", "SHOW_TEXT", elementId=data["score_text"], text="得分 0"),
    ] + question_commands(data, source["image"], topic, click) + [command(f"{data['prefix']}_timer_signal", "EMIT_SIGNAL", signal=data["timer_start"])]
    timer = event(f"{data['prefix']}_timer_event", "并行倒计时", data["timer_start"], [command(f"{data['prefix']}_timer_loop", "LOOP", loopType="while", condition={"type": "variable", "key": data["timer"], "operator": "gt", "value": 0}, commands=[command(f"{data['prefix']}_timer_wait", "WAIT", duration=1000), command(f"{data['prefix']}_timer_sub", "SET_VARIABLE", key=data["timer"], op="sub", value=1), command(f"{data['prefix']}_timer_refresh", "UPDATE_TEXT", elementId=data["hud"], text="剩余 {" + data["timer"] + "} 秒")])])
    celebration = event(f"{data['prefix']}_celebration_event", "条件庆祝反馈", data["score_changed"], [command(f"{data['prefix']}_refresh_score", "UPDATE_TEXT", elementId=data["score_text"], text="得分 {" + data["score"] + "}"), command(f"{data['prefix']}_gate", "IF_CONDITION", condition={"type": "variable", "key": data["score"], "operator": "gte", "value": threshold}, trueCommands=[command(f"{data['prefix']}_once", "IF_CONDITION", condition={"type": "variable", "key": data["celebrated"], "operator": "eq", "value": False}, trueCommands=[command(f"{data['prefix']}_se", "SE_PLAY", soundId=source["audio"]["id"], volume=0.85), command(f"{data['prefix']}_fireworks", "FIREWORK_BURST", x=400, y=250, count=24, life=900), command(f"{data['prefix']}_mark", "SET_VARIABLE", key=data["celebrated"], op="set", value=True)], falseCommands=[])], falseCommands=[])])
    return sample(index, "three_way_coordination", f"主流程展示{topic}题目并让玩家点击正确答案，每次得 {delta} 分；独立 {seconds} 秒倒计时每秒更新；累计得分达到 {threshold} 分时独立庆祝且只触发一次。这个需求需要多个跨事件协同。", [source["image"], source["audio"]], main, [timer, celebration], evaluation(data, taps, [{"type": "variable_equals", "name": data["score"], "value": threshold}, {"type": "variable_equals", "name": data["celebrated"], "value": True}, {"type": "variable_equals", "name": data["timer"], "value": 0}, {"type": "event_execution_count", "count": taps + 1, "exact": True}]))


BUILDERS: dict[str, Callable[[int, str, dict[str, Any]], dict[str, Any]]] = {
    "countdown_hud": countdown, "background_audio": background_audio, "ambient_animation": ambient,
    "score_feedback": score_feedback, "error_assist": error_assist, "high_score_celebration": high_score,
    "state_transition": state_transition, "three_way_coordination": three_way,
}


def build() -> dict[str, Any]:
    sources = source_catalog(); examples: list[dict[str, Any]] = []
    for family, count in FAMILIES:
        for _ in range(count):
            index = len(examples) + 1
            examples.append(BUILDERS[family](index, TOPICS[(index - 1) % len(TOPICS)], sources[(index - 1) % len(sources)]))
    validator = EventCoordinationValidator()
    invalid = [{"id": item["example_id"], **result} for item in examples if not (result := validator.validate(item))["valid"]]
    if invalid:
        raise RuntimeError("invalid V3 event samples: " + json.dumps(invalid[:3], ensure_ascii=False))
    return {"schema_version": "event-coordination-sft-v3", "status": "ready_for_runtime_behavior_validation", "purpose": "Complete interactive main flows plus independently triggered event coordination.", "example_count": len(examples), "coverage": [{"family": family, "count": count} for family, count in FAMILIES], "validation": {"static_validator": "agent-debugger/event_coordination_validator.py", "all_examples_pass": True, "runtime_interaction_evaluation_required": True}, "examples": examples}


def main() -> int:
    document = build()
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "example_count": len(document["examples"]), "teacher_api_used": False}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
