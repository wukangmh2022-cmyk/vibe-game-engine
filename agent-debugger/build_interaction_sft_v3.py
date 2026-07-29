#!/usr/bin/env python3
"""Build deterministic browser-interaction SFT supplements without teacher APIs.

Every sample uses actual scene image resources and the parameters consumed by
the registered Pixi/browser handlers. Browser replay is intentionally deferred;
static handler-contract validation is the acceptance gate for this supplement.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from build_command_db import ROOT as REPO_ROOT
from curriculum_plan import PREFERRED_FAMILIES
from event_coordination_validator import EventCoordinationValidator


ROOT = REPO_ROOT
SCENE_DIR = ROOT / "customer-demo" / "scene"
OUTPUT_PATH = ROOT / "training-data" / "interaction-sft-v3.json"
REPORT_PATH = ROOT / "training-data" / "interaction-sft-v3-validation.json"

FAMILIES = [
    ("clickable", 25), ("animate_in", 25), ("selectable", 25),
    ("draggable", 25), ("check_in_area", 25), ("animate_out", 25),
    ("flip_card", 25), ("change_selected_state", 25), ("interaction_chain", 40),
]
TOPICS = ["水果分类", "卡片记忆", "药品整理", "昆虫观察", "工具匹配", "顺序判断", "食材回忆", "数字比较"]


def command(id_: str, type_: str, **parameters: Any) -> dict[str, Any]:
    return {"id": id_, "type": type_, "parameters": parameters}


def source_images() -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    for family in PREFERRED_FAMILIES:
        scene_path = SCENE_DIR / f"{family}.json"
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        for item in (scene.get("resources") or {}).get("images") or []:
            if not isinstance(item, dict) or not item.get("id") or not item.get("src"):
                continue
            path = str(item["src"])
            if not (ROOT / "customer-demo" / path).is_file():
                continue
            images.append({
                "id": str(item["id"]), "type": "image", "path": path,
                "origin": "existing", "exists": True,
                "source_scene_family": family,
            })
    if len(images) < 2:
        raise RuntimeError("need at least two real scene images for interaction samples")
    return images


def setup(index: int, assets: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any], dict[str, Any], str]:
    prefix = f"iv3_{index:03d}"
    topic = TOPICS[(index - 1) % len(TOPICS)]
    front = assets[(index - 1) % len(assets)]
    back = assets[index % len(assets)]
    return prefix, topic, front, back, f"card_{index}"


def image_command(prefix: str, element_id: str, asset: dict[str, Any]) -> dict[str, Any]:
    return command(
        f"{prefix}_show", "SHOW_IMAGE", elementId=element_id, resourceId=asset["id"],
        position={"x": 180, "y": 140}, size={"width": 180, "height": 180}, visible=True, zIndex=10,
    )


def clickable(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    return sample(index, "clickable", f"展示一张{topic}卡片；玩家点击卡片后把已点击状态设为 true。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_click", "SET_CLICKABLE", elementId=element, clickable=True, blocking=False, onClick="commands", commands=[
            command(f"{prefix}_mark_clicked", "SET_VARIABLE", key=f"clicked_{index}", op="set", value=True),
        ]),
    ])


def animate_in(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    preset = ("fade", "bounce", "scaleIn", "moveIn")[index % 4]
    return sample(index, "animate_in", f"显示{topic}提示卡片后，让它以{preset}入场动画出现。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_animate_in", "ANIMATE_IN", elementId=element, preset=preset, duration=400 + index % 3 * 150, direction="up"),
    ])


def selectable(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    return sample(index, "selectable", f"展示{topic}选项卡并允许玩家选中或取消选中，同时把选择状态写入变量。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_selectable", "SET_SELECTABLE", elementId=element, selectable=True, variableKey=f"selected_{index}", singleSelect=index % 2 == 0),
    ])


def draggable(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    return sample(index, "draggable", f"展示{topic}物品并让玩家可以拖动它。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_draggable", "SET_DRAGGABLE", elementId=element, draggable=True, dragType=f"item_{index % 4}"),
    ])


def check_in_area(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    return sample(index, "check_in_area", f"让玩家拖动{topic}物品；放入指定区域时记录投放成功。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_draggable", "SET_DRAGGABLE", elementId=element, draggable=True, dragType=f"item_{index % 4}"),
        command(f"{prefix}_drop_check", "CHECK_IN_AREA", elementId=element, area={"x": 500, "y": 150, "width": 180, "height": 180}, triggerMode="once", requireEnter=True, commands=[
            command(f"{prefix}_drop_ok", "SET_VARIABLE", key=f"drop_success_{index}", op="set", value=True),
        ]),
    ])


def animate_out(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    preset = ("fade", "scaleOut", "moveOut")[index % 3]
    return sample(index, "animate_out", f"展示{topic}反馈卡片后，让它以{preset}退场动画消失。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_animate_out", "ANIMATE_OUT", elementId=element, preset=preset, duration=400 + index % 3 * 150, direction="down"),
    ])


def flip_card(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, back, element = setup(index, assets)
    return sample(index, "flip_card", f"展示{topic}卡牌正面后，将它翻到背面图片。该需求不需要跨事件协同。", [front, back], [
        image_command(prefix, element, front),
        command(f"{prefix}_flip", "FLIP_CARD", elementId=element, frontResourceId=front["id"], backResourceId=back["id"], showBack=True, duration=500),
    ])


def change_selected_state(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, _, element = setup(index, assets)
    return sample(index, "change_selected_state", f"展示{topic}选项卡，先配置为可选中，再将它设为选中状态。该需求不需要跨事件协同。", [front], [
        image_command(prefix, element, front),
        command(f"{prefix}_selectable", "SET_SELECTABLE", elementId=element, selectable=True, variableKey=f"selected_{index}", singleSelect=False),
        command(f"{prefix}_select", "CHANGE_SELECTED_STATE", elementId=element, selected=True),
    ])


def interaction_chain(index: int, assets: list[dict[str, Any]]) -> dict[str, Any]:
    prefix, topic, front, back, element = setup(index, assets)
    variant = index % 4
    if variant == 0:
        commands = [image_command(prefix, element, front), command(f"{prefix}_in", "ANIMATE_IN", elementId=element, preset="scaleIn", duration=450), command(f"{prefix}_click", "SET_CLICKABLE", elementId=element, clickable=True, onClick="commands", commands=[command(f"{prefix}_seen", "SET_VARIABLE", key=f"seen_{index}", op="set", value=True)])]
        intent = f"显示{topic}卡片并以缩放动画入场；点击卡片后记录已查看。该需求不需要跨事件协同。"
    elif variant == 1:
        commands = [image_command(prefix, element, front), command(f"{prefix}_selectable", "SET_SELECTABLE", elementId=element, selectable=True, variableKey=f"selected_{index}", singleSelect=False), command(f"{prefix}_select", "CHANGE_SELECTED_STATE", elementId=element, selected=True), command(f"{prefix}_out", "ANIMATE_OUT", elementId=element, preset="fade", duration=400)]
        intent = f"显示{topic}选项，设为可选中并选中它，然后淡出反馈卡片。该需求不需要跨事件协同。"
    elif variant == 2:
        commands = [image_command(prefix, element, front), command(f"{prefix}_drag", "SET_DRAGGABLE", elementId=element, draggable=True, dragType="answer"), command(f"{prefix}_area", "CHECK_IN_AREA", elementId=element, area={"x": 480, "y": 150, "width": 180, "height": 180}, triggerMode="once", commands=[command(f"{prefix}_score", "SET_VARIABLE", key=f"correct_{index}", op="set", value=True)])]
        intent = f"显示{topic}物品并允许拖动；放进答案区域后标记为正确。该需求不需要跨事件协同。"
    else:
        commands = [image_command(prefix, element, front), command(f"{prefix}_click_flip", "SET_CLICKABLE", elementId=element, clickable=True, onClick="flip", frontResourceId=front["id"], backResourceId=back["id"], showBack=True), command(f"{prefix}_flip", "FLIP_CARD", elementId=element, frontResourceId=front["id"], backResourceId=back["id"], showBack=True, duration=500)]
        intent = f"显示{topic}卡牌并配置点击翻面，翻到背面图片。该需求不需要跨事件协同。"
    assets_used = [front, back] if variant == 3 else [front]
    return sample(index, "interaction_chain", intent, assets_used, commands)


BUILDERS: dict[str, Callable[[int, list[dict[str, Any]]], dict[str, Any]]] = {
    "clickable": clickable, "animate_in": animate_in, "selectable": selectable, "draggable": draggable,
    "check_in_area": check_in_area, "animate_out": animate_out, "flip_card": flip_card,
    "change_selected_state": change_selected_state, "interaction_chain": interaction_chain,
}


def sample(index: int, family: str, intent: str, assets: list[dict[str, Any]], commands: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema_version": "interaction-sft-v3", "example_id": f"interaction-v3-{index:03d}",
        "input": {"intent": intent, "asset_catalog": assets},
        "output": {"commands": commands, "extra_events": []},
        "task_spec": {"family": family, "browser_replay": "deferred", "teacher_api_used": False},
        "validation": {"static_contract_valid": True, "browser_replay": "deferred"},
    }


def build() -> dict[str, Any]:
    assets = source_images()
    examples: list[dict[str, Any]] = []
    for family, count in FAMILIES:
        for _ in range(count):
            examples.append(BUILDERS[family](len(examples) + 1, assets))
    validator = EventCoordinationValidator()
    invalid = [{"id": item["example_id"], **result} for item in examples if not (result := validator.validate(item, mode="level_context"))["valid"]]
    if invalid:
        raise RuntimeError("invalid interaction samples: " + json.dumps(invalid[:3], ensure_ascii=False))
    return {
        "schema_version": "interaction-sft-v3", "status": "ready_for_training_static_contract_valid",
        "purpose": "Fill browser/Pixi interaction command coverage without calling a teacher API.",
        "example_count": len(examples), "coverage": [{"family": family, "count": count} for family, count in FAMILIES],
        "excluded": [{"command_type": "SCRIPT", "reason": "arbitrary executable code is not a bounded DSL training target"}],
        "validation": {"validator": "agent-debugger/event_coordination_validator.py", "mode": "level_context", "all_examples_pass": True},
        "examples": examples,
    }


def main() -> int:
    document = build()
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {"total": len(document["examples"]), "valid": len(document["examples"]), "invalid": 0}
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "example_count": document["example_count"], "teacher_api_used": False}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
