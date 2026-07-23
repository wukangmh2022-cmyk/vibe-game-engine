"""Independent behavior benchmark: authored without reading any training corpus.

The resource IDs and virtual paths below exist only in evaluation prompts. The
runtime maps them to deterministic placeholders, so resource-contract coverage
is retained without reusing a training asset or training-level composition.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


SCENARIOS = [
    ("archive", "档案馆封印", "archive_seal"),
    ("observatory", "天文台刻度盘", "observatory_dial"),
    ("workshop", "修复工坊芯片", "workshop_chip"),
    ("harbor", "港口信号旗", "harbor_flag"),
    ("library", "图书馆索引页", "library_index"),
    ("greenhouse", "温室气候计", "greenhouse_meter"),
    ("station", "轨道站通行牌", "station_pass"),
    ("atelier", "制图室罗盘", "atelier_compass"),
    ("planetarium", "星象馆投影片", "planetarium_slide"),
    ("lighthouse", "灯塔校准片", "lighthouse_plate"),
]


def command(command_id: str, command_type: str, **parameters: Any) -> dict[str, Any]:
    return {"id": command_id, "type": command_type, "parameters": parameters}


def asset(slug: str, title: str) -> dict[str, Any]:
    return {
        "id": f"eval_{slug}_image", "type": "image",
        "path": f"virtual://heldout-evaluation/v3/{slug}.png", "name": title,
        "origin": "evaluation", "exists": True,
    }


def case_base(case_id: str, category: str, intent: str, assets: list[dict[str, Any]], required: list[str], oracle: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": case_id, "category": category, "test_partition": "heldout-v3",
        "intent": intent, "asset_catalog": assets, "required_command_types": required, "oracle": oracle,
    }


def tap_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"tap_{slug}", title)
    variable = f"confirmed_{slug}"
    intent = [
        f"在画面上方放一个{title}。玩家点过后，把它记为已确认。",
        f"把{title}放在上方，用户点一下就算确认过。",
        f"希望玩家先看到{title}，点它一次后留下已确认的记录。",
    ][index % 3]
    case = case_base(
        f"tap-{slug}", "click", intent,
        [item], ["SHOW_IMAGE", "SET_CLICKABLE", "SET_VARIABLE"],
        {"actions": [{"type": "tap", "target_selector": {"command_type": "SET_CLICKABLE"}}], "assertions": [{"type": "variable_changed_after_actions", "value": True}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"], position={"x": 40 + index * 20, "y": 70}, size={"width": 96, "height": 96}),
            command(f"click_{element}", "SET_CLICKABLE", elementId=element, onClick="commands", commands=[command(f"set_{variable}", "SET_VARIABLE", key=variable, op="set", value=True)]),
        ], "extra_events": [],
    }
    return case


def drag_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"drag_{slug}", title)
    x, y, width, height = 30 + index * 15, 120, 80, 80
    target = {"x": 430 + index * 8, "y": 260 + index * 5}
    expected = {"x": target["x"] - width / 2, "y": target["y"] - height / 2}
    intent = [
        f"把{title}放在左下角，右侧留一块空位给玩家拖过去。",
        f"让{title}从左下方出现，用户可以把它拖到画面右边。",
        f"右侧留出一个位置，让玩家把左下角的{title}拖过去。",
    ][index % 3]
    case = case_base(
        f"drag-{slug}", "drag", intent,
        [item], ["SHOW_IMAGE", "SET_DRAGGABLE"],
        {"actions": [{"type": "drag", "target_selector": {"command_type": "SET_DRAGGABLE"}, "to": target}], "assertions": [{"type": "element_position", "target_selector": {"command_type": "SET_DRAGGABLE"}, "x": expected["x"], "y": expected["y"], "tolerance": 2}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"], position={"x": x, "y": y}, size={"width": width, "height": height}),
            command(f"drag_{element}", "SET_DRAGGABLE", elementId=element, draggable=True),
        ], "extra_events": [],
    }
    return case


def drop_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"drop_{slug}", title)
    variable = f"placed_{slug}"
    area = {"x": 380 + index * 12, "y": 140, "width": 150, "height": 140}
    target = {"x": area["x"] + 70, "y": area["y"] + 70}
    intent = [
        f"做个{title}归位互动：把它拖进右侧的放置框后算一次成功，同一次别重复计算。",
        f"画面右边放一个归位区域，玩家把{title}拖进去时记一次完成，重复放进去不再计数。",
        f"让玩家把{title}送到右侧对应位置。放对后记录成功，但不要因为同一次操作重复加结果。",
    ][index % 3]
    case = case_base(
        f"drop-{slug}", "drop", intent,
        [item], ["SHOW_IMAGE", "SET_DRAGGABLE", "CHECK_IN_AREA", "SET_VARIABLE"],
        {"actions": [{"type": "drag", "target_selector": {"command_type": "SET_DRAGGABLE"}, "to": target}], "assertions": [{"type": "variable_changed_after_actions", "value": True}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"], position={"x": 55, "y": 220}, size={"width": 72, "height": 72}),
            command(f"drag_{element}", "SET_DRAGGABLE", elementId=element, draggable=True),
            command(f"check_{element}", "CHECK_IN_AREA", elementId=element, area=area, triggerMode="once", commands=[command(f"set_{variable}", "SET_VARIABLE", key=variable, op="set", value=True)]),
        ], "extra_events": [],
    }
    return case


def flip_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    front = asset(f"flip_front_{slug}", f"{title}正面")
    back = asset(f"flip_back_{slug}", f"{title}背面")
    intent = [
        f"给{title}做一张双面卡，正面和背面用提供的图片，翻开时带一点短过渡。",
        f"显示{title}卡片，玩家能看到它从正面翻到背面，两面分别用给的图片。",
        f"把{title}做成翻翻卡，翻面不要生硬，正反两面使用提供的资源。",
    ][index % 3]
    case = case_base(
        f"flip-{slug}", "flip", intent,
        [front, back], ["SHOW_IMAGE", "FLIP_CARD"],
        {"actions": [{"type": "advance_frames", "frames": 3}], "assertions": [{"type": "element_property_equals", "target_selector": {"command_type": "FLIP_CARD"}, "property": "__isBack", "value": True}, {"type": "event_emitted", "event": "card_face_changed"}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=front["id"]),
            command(f"flip_{element}", "FLIP_CARD", elementId=element, frontResourceId=front["id"], backResourceId=back["id"], showBack=True, duration=260 + index * 20),
        ], "extra_events": [],
    }
    return case


def click_event_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"signal_{slug}", title)
    signal, event_id, variable = f"activate_{slug}", f"on_activate_{slug}", f"event_seen_{slug}"
    intent = [
        f"玩家点下{title}后，等确认完成再记一次结果，别影响当前画面的其他操作。",
        f"显示{title}，点击后补做一次确认记录；这一步不该卡住页面。",
        f"用户确认{title}时，随后记下这次确认已经处理完成，其他内容照常可用。",
    ][index % 3]
    case = case_base(
        f"click-event-{slug}", "click_event", intent,
        [item], ["SHOW_IMAGE", "SET_CLICKABLE", "EMIT_SIGNAL", "SET_VARIABLE"],
        {"actions": [{"type": "tap", "target_selector": {"command_type": "SET_CLICKABLE"}}], "assertions": [{"type": "variable_changed_after_actions", "value": True}, {"type": "event_execution_after_actions", "count": 1}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"]),
            command(f"click_{element}", "SET_CLICKABLE", elementId=element, onClick="commands", commands=[command(f"emit_{signal}", "EMIT_SIGNAL", signal=signal)]),
        ], "extra_events": [{"id": event_id, "name": f"处理{title}", "triggers": [{"type": "custom", "target": signal}], "commands": [command(f"set_{variable}", "SET_VARIABLE", key=variable, op="set", value=True)]}],
    }
    return case


def toggle_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"toggle_{slug}", title)
    intent = [
        f"把{title}做成一个可选项目，玩家点一下时要看得出它被选中了。",
        f"显示{title}选项，用户点它后给出明确的选中状态。",
        f"让{title}可以被挑中，点过以后在画面上保留选中的反馈。",
    ][index % 3]
    case = case_base(
        f"toggle-{slug}", "selection", intent,
        [item], ["SHOW_IMAGE", "SET_SELECTABLE"],
        {"actions": [{"type": "tap", "target_selector": {"command_type": "SET_SELECTABLE"}}], "assertions": [{"type": "element_property_equals", "target_selector": {"command_type": "SET_SELECTABLE"}, "property": "__selected", "value": True}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"], position={"x": 100 + index * 8, "y": 350}),
            command(f"selectable_{element}", "SET_SELECTABLE", elementId=element, selectable=True),
        ], "extra_events": [],
    }
    return case


def auto_chain_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"auto_{slug}", title)
    signal, auto_id, event_id, variable = f"ready_{slug}", f"auto_{slug}", f"on_ready_{slug}", f"auto_chain_{slug}"
    intent = [
        f"页面打开先展示{title}，等准备完成后自动把它变为可用，并记下已经就绪。",
        f"显示{title}后让它自己完成准备；准备好时自动保存可用状态。",
        f"{title}刚出现时先处于准备中，准备结束后自动标记为就绪。",
    ][index % 3]
    case = case_base(
        f"auto-chain-{slug}", "auto_event", intent,
        [item], ["SHOW_IMAGE", "EMIT_SIGNAL", "SET_VARIABLE"],
        {"actions": [{"type": "advance_frames", "frames": 2}], "assertions": [{"type": "element_exists", "target": element}, {"type": "truthy_variable_count", "minimum": 1}, {"type": "event_execution_count", "minimum": 2}]},
    )
    case["reference_output"] = {
        "intent": case["intent"], "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"])],
        "extra_events": [
            {"id": auto_id, "name": f"自动启动{title}", "triggers": [{"type": "auto", "start": "immediate"}], "commands": [command(f"emit_{signal}", "EMIT_SIGNAL", signal=signal)]},
            {"id": event_id, "name": f"处理{title}就绪", "triggers": [{"type": "custom", "target": signal}], "commands": [command(f"set_{variable}", "SET_VARIABLE", key=variable, op="set", value=True)]},
        ],
    }
    return case


def complex_coordination_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(f"complex_{slug}", title)
    ready_signal, select_signal = f"booted_{slug}", f"selected_{slug}"
    auto_id, ready_id, select_id = f"auto_boot_{slug}", f"on_booted_{slug}", f"on_selected_{slug}"
    phase, ready, accepted = f"phase_{slug}", f"ready_{slug}", f"accepted_{slug}"
    intent = [
        f"做一段{title}确认玩法：进入页面先准备本轮内容，然后显示图标；准备好后让它可用，然后允许玩家确认；玩家点下后再核对准备状态，然后记下这次确认是否有效。",
        f"{title}出现后先完成准备，再开放给玩家确认。用户点下时要看当前是否已经可用，然后分别记录有效和无效的结果。",
        f"页面打开时先把{title}准备好并展示出来；等它可用后玩家才能确认。确认时再检查准备状态，然后保存本次结果。",
    ][index % 3]
    case = case_base(
        f"complex-{slug}", "complex_coordination", intent, [item],
        ["SET_VARIABLE", "SHOW_IMAGE", "SET_CLICKABLE", "EMIT_SIGNAL", "IF_CONDITION"],
        {
            "actions": [{"type": "advance_frames", "frames": 2}, {"type": "tap", "target_selector": {"command_type": "SET_CLICKABLE"}}],
            "assertions": [
                {"type": "variable_changed_after_actions", "value": True},
                {"type": "event_execution_after_actions", "count": 1},
            ],
        },
    )
    case["reference_output"] = {
        "intent": intent, "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"set_{phase}", "SET_VARIABLE", key=phase, op="set", value=0),
            command(f"show_{element}", "SHOW_IMAGE", elementId=element, resourceId=item["id"], position={"x": 120, "y": 180}, size={"width": 100, "height": 100}),
            command(f"click_{element}", "SET_CLICKABLE", elementId=element, onClick="commands", commands=[command(f"emit_{select_signal}", "EMIT_SIGNAL", signal=select_signal)]),
        ],
        "extra_events": [
            {"id": auto_id, "name": f"启动{title}", "triggers": [{"type": "auto", "start": "immediate"}], "commands": [command(f"emit_{ready_signal}", "EMIT_SIGNAL", signal=ready_signal)]},
            {"id": ready_id, "name": f"{title}就绪", "triggers": [{"type": "custom", "target": ready_signal}], "commands": [command(f"set_{ready}", "SET_VARIABLE", key=ready, op="set", value=True)]},
            {"id": select_id, "name": f"确认{title}", "triggers": [{"type": "custom", "target": select_signal}], "commands": [
                command(f"if_{ready}", "IF_CONDITION", condition={"type": "variable", "key": ready, "operator": "eq", "value": True}, trueCommands=[command(f"set_{accepted}_true", "SET_VARIABLE", key=accepted, op="set", value=True)], falseCommands=[command(f"set_{accepted}_false", "SET_VARIABLE", key=accepted, op="set", value=False)]),
            ]},
        ],
    }
    return case


def benchmark() -> dict[str, Any]:
    cases: list[dict[str, Any]] = []
    for index, (slug, title, element) in enumerate(SCENARIOS, start=1):
        cases.append(tap_case(index, slug, title, f"tap_{element}"))
        cases.append(drag_case(index, slug, title, f"drag_{element}"))
        cases.append(drop_case(index, slug, title, f"drop_{element}"))
        cases.append(flip_case(index, slug, title, f"flip_{element}"))
        cases.append(click_event_case(index, slug, title, f"signal_{element}"))
        cases.append(toggle_case(index, slug, title, f"toggle_{element}"))
        cases.append(auto_chain_case(index, slug, title, f"auto_{element}"))
        cases.append(complex_coordination_case(index, slug, title, f"complex_{element}"))
    return {
        "schema_version": "vibe-interaction-event-eval-v3-heldout",
        "description": "80 independently authored, held-out interaction and event cases. No training corpus or training assets are read or reused.",
        "system": "The runtime evaluator supplies the editor's canonical prompt guide.",
        "cases": cases,
    }
