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

# One reviewed phrasing per scenario and behavior category. The nouns and
# assets are evaluation-only; these sentence patterns are varied to resemble
# real editor requests without copying any training query or exposing commands.
INTENT_TEMPLATES = {
    "click": [
        "把{title}放在画面上方，玩家点一下后记住它已经确认过。",
        "我想先展示{title}，用户点击它以后留下确认记录。",
        "在顶部显示{title}；点过一次，就把本次确认状态保存下来。",
        "做一个可点击的{title}，点击成功后记录为已确认。",
        "让玩家看到{title}并亲手确认，点下去以后保存确认结果。",
        "页面上方需要一个{title}，用户选择它时记下已确认。",
        "显示{title}作为确认入口，玩家点击后更新确认状态。",
        "请把{title}摆在上方，点它一次就完成确认并留下记录。",
        "给{title}加上点击确认，确认发生后把结果保存起来。",
        "玩家应该能点击顶部的{title}，点击后系统记住已经确认。",
    ],
    "drag": [
        "把{title}放在左下方，让玩家能把它拖到画面右侧。",
        "需要一个从左下角拖往右边的{title}。",
        "让{title}出现在左边偏下的位置，并支持自由拖到右侧。",
        "玩家要能抓住左下方的{title}，移动到画面右边。",
        "请做个简单拖拽：{title}从左下方开始，可以拖去右侧。",
        "在左下角摆放{title}，右边留出玩家移动它的空间。",
        "显示一个可拖动的{title}，初始位置在左下，目标方向是右侧。",
        "我希望用户能把左下区域的{title}拖到屏幕右边。",
        "把{title}作为拖拽物放在左下方，允许玩家移动到右侧。",
        "做一个从左到右的拖动操作，拖动对象使用{title}。",
    ],
    "drop": [
        "让玩家把{title}拖进右侧指定区域；放对后记一次成功，同一次进入不要重复记录。",
        "做个{title}归位互动，拖到右边目标区域就算完成，而且只结算一次。",
        "{title}需要拖到右侧位置，首次放入时保存成功，重复触发不能再次累计。",
        "请在右侧设定投放区域，{title}拖进去后标记完成，并防止一次操作重复计数。",
        "玩家把{title}送到右边正确位置时记录成功，这次放置只能产生一个结果。",
        "做一个防重复的拖放任务：{title}进入右侧区域后完成一次。",
        "把{title}拖入右方目标范围便算归位；同一次命中不要连续触发。",
        "我需要{title}的归位玩法，目标在右侧，成功状态只写一次。",
        "{title}从左边拖往右侧区域，放对后保存完成状态并避免重复结算。",
        "设置一个右侧投放位置，让玩家拖入{title}，一次拖放最多记一次成功。",
    ],
    "flip": [
        "把{title}做成双面卡，正反面分别使用给出的图片，并用短过渡翻到背面。",
        "显示一张{title}翻翻卡，让玩家看到它从正面平滑翻到背面。",
        "请用两张资源制作{title}卡片，翻面时不要瞬间硬切。",
        "做一个{title}的正反面切换效果，先显示正面，再带动画翻出背面。",
        "我想要一张会翻面的{title}卡，两面使用对应图片，过渡简短自然。",
        "让{title}从正面翻转到背面，两张提供的图都要正确使用。",
        "展示{title}双面卡并完成一次翻面，正反资源不能用反。",
        "给{title}加一个短促的翻牌过程，最终停在背面。",
        "用提供的正面图和背面图做{title}，播放一次平滑翻转。",
        "页面里放一张{title}卡片，从正面过渡到背面并保留翻面结果。",
    ],
    "click_event": [
        "显示{title}。点击只负责发起确认，另一条处理流程收到后记录完成，页面不要被阻塞。",
        "用户点{title}时发起一次确认通知，由独立处理环节保存结果，其他交互照常可用。",
        "给{title}做非阻塞确认：点击发出请求，后续流程再记下已经处理。",
        "点击{title}后交给另一段逻辑完成确认记录，不能让当前页面停住等待。",
        "玩家确认{title}时先触发处理消息，记录动作由对应处理流程完成。",
        "{title}的点击和结果保存需要解耦：点击发起，接收流程记录，页面继续运行。",
        "做一个异步的{title}确认入口，点击后由后续处理环节写入完成状态。",
        "用户点下{title}只启动确认，真正的完成记录放到独立响应流程中。",
        "请让{title}点击后通知确认处理流程，并由它保存结果，不阻塞主画面。",
        "{title}被点击时发起确认事件，另一条流程处理并记录这次确认。",
    ],
    "selection": [
        "把{title}做成可选项目，玩家点过以后要有清楚的选中反馈。",
        "显示{title}供用户选择，选中后在画面上保留状态变化。",
        "让玩家能够选中{title}，点击前后必须看得出差别。",
        "请给{title}增加选择状态，用户点一下后显示它已被选中。",
        "做一个可点选的{title}，选择发生后需要明确的视觉反馈。",
        "{title}应该能被挑中，并在点选后保持选中状态。",
        "玩家选择{title}以后不要毫无反应，要展示已选中的效果。",
        "把{title}作为选择项展示，点击后切换到清晰的选中状态。",
        "给{title}做单项选择交互，选中结果需要留在画面上。",
        "显示一个可选择的{title}，用户点中后提供可见反馈。",
    ],
    "auto_event": [
        "页面打开后自动启动{title}的准备流程；准备完成要通知状态记录环节，把它标为就绪。",
        "显示{title}并自动进行准备，完成后由后续响应流程保存可用状态。",
        "{title}出现时自动开始初始化；初始化结束发出完成通知，再记录已经就绪。",
        "进入页面就运行{title}的准备任务，任务完成后通知另一环节写入就绪状态。",
        "请让{title}自动完成准备，并在完成消息被处理后保存为可用。",
        "{title}加载后不需要玩家操作，准备流程自动运行，结束时由响应流程标记完成。",
        "做一条自动准备链：展示{title}，准备结束后通知状态处理并记录就绪。",
        "页面启动时自动准备{title}，完成通知需要触发后续的就绪记录。",
        "让{title}进入页面后自行初始化，初始化完成再交给响应环节保存状态。",
        "展示{title}后自动发起准备；收到准备完成通知时将它记为可用。",
    ],
    "complex_coordination": [
        "{title}进入页面后先自动准备并展示。准备完成后标记可用；玩家点击确认时，再根据当前是否可用分别记录有效或无效结果。",
        "做一个{title}确认流程：页面启动时准备内容，玩家点击后由确认处理环节检查就绪状态并保存对应结果。",
        "先自动初始化{title}并记录准备状态，然后开放点击；每次确认都要检查状态，成功和未就绪分别记录。",
        "展示{title}并启动准备链。用户确认时交给另一处理流程，根据准备是否完成写入不同结果。",
        "{title}需要先完成自动准备。点击只发起确认，响应流程读取就绪状态后保存有效或无效。",
        "进入页面先准备{title}，完成后记为可用；玩家点击时再次核对该状态，并保留两种分支结果。",
        "请实现{title}的准备与确认协作：自动准备更新状态，点击确认依据状态决定是否接受。",
        "页面打开自动处理{title}的就绪流程；用户随后确认时，由后续环节按当前状态记录结果。",
        "让{title}先自动变为可用，再允许玩家发起确认；确认环节必须判断准备状态并处理正反两种情况。",
        "构建{title}的完整确认链：自动准备、保存就绪、用户点击、检查状态、分别记录有效和无效。",
    ],
    "choice": [
        "围绕{title}给玩家两个选项：现在确认或稍后处理；选择现在确认后保存结果。",
        "弹出{title}的处理选择，让用户决定立即确认还是暂时跳过，并记录第一种选择。",
        "请给{title}做一个二选一菜单，玩家选确认时把确认状态保存下来。",
        "显示关于{title}的两个文字选项，选择继续后记录本次决定。",
        "让玩家决定是否立刻处理{title}，选中立即处理时留下完成记录。",
        "做一个{title}确认菜单，包含确认和稍后两个选择，确认分支需要更新状态。",
        "页面上提供{title}的二选一操作，用户点击确认项后保存已确认。",
        "为{title}显示继续或取消选项，继续这一项被选择时记下结果。",
        "给玩家一个{title}处理菜单，第一项用于确认，并在选择后保存状态。",
        "弹出{title}的确认选择，用户选现在处理后系统要记住这次决定。",
    ],
    "presentation_sequence": [
        "先显示一段{title}提示文字，短暂停顿后播放提示音并展示对应图片，最后记录已经展示。",
        "做一个{title}提示流程：文字先出现，稍等片刻，再响一声并显示图片，同时保存完成状态。",
        "页面先给出{title}说明，随后播放提供的音效和图片，结束时记下内容已展示。",
        "请按文字、短等待、提示音、图片的顺序呈现{title}，并记录流程完成。",
        "展示{title}时先出文字提示，停顿一下再播放声音和图像，最后保存已展示标记。",
        "我需要一段{title}登场流程：说明文字在前，声音与图片稍后出现，并留下完成记录。",
        "让{title}通过文字提示开始，经过短暂等待后播放音效并显示资源图片，然后标记完成。",
        "先告诉玩家{title}即将出现，再稍等一会播放声音、展示图片，并记住已经播过。",
        "制作{title}的简短展示序列，依次包含文字、停顿、音效和图片，结尾更新状态。",
        "{title}需要先用文字说明，随后用提示音和图片正式展示，完成后保存展示状态。",
    ],
}


def reviewed_intent(category: str, index: int, title: str) -> str:
    return INTENT_TEMPLATES[category][index - 1].format(title=title)


def command(command_id: str, command_type: str, **parameters: Any) -> dict[str, Any]:
    return {"id": command_id, "type": command_type, "parameters": parameters}


def asset(slug: str, title: str) -> dict[str, Any]:
    return {
        "id": f"eval_{slug}_image", "type": "image",
        "path": f"virtual://heldout-evaluation/v4/{slug}.png", "name": title,
        "origin": "evaluation", "exists": True,
    }


def audio_asset(slug: str, title: str) -> dict[str, Any]:
    return {
        "id": f"eval_{slug}_audio", "type": "audio",
        "path": f"virtual://heldout-evaluation/v4/{slug}.mp3", "name": title,
        "origin": "evaluation", "exists": True,
    }


def case_base(case_id: str, category: str, intent: str, assets: list[dict[str, Any]], required: list[str], oracle: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": case_id, "category": category, "test_partition": "heldout-v4",
        "intent": intent, "asset_catalog": assets, "required_command_types": required, "oracle": oracle,
    }


def tap_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    item = asset(slug, title)
    variable = f"confirmed_{slug}"
    intent = reviewed_intent("click", index, title)
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
    item = asset(slug, title)
    x, y, width, height = 30 + index * 15, 120, 80, 80
    target = {"x": 430 + index * 8, "y": 260 + index * 5}
    expected = {"x": target["x"] - width / 2, "y": target["y"] - height / 2}
    intent = reviewed_intent("drag", index, title)
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
    item = asset(slug, title)
    variable = f"placed_{slug}"
    area = {"x": 380 + index * 12, "y": 140, "width": 150, "height": 140}
    target = {"x": area["x"] + 70, "y": area["y"] + 70}
    intent = reviewed_intent("drop", index, title)
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
    front = asset(f"{slug}_front", f"{title}正面")
    back = asset(f"{slug}_back", f"{title}背面")
    intent = reviewed_intent("flip", index, title)
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
    item = asset(slug, title)
    signal, event_id, variable = f"activate_{slug}", f"on_activate_{slug}", f"event_seen_{slug}"
    intent = reviewed_intent("click_event", index, title)
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
    item = asset(slug, title)
    intent = reviewed_intent("selection", index, title)
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
    item = asset(slug, title)
    signal, auto_id, event_id, variable = f"ready_{slug}", f"auto_{slug}", f"on_ready_{slug}", f"auto_chain_{slug}"
    intent = reviewed_intent("auto_event", index, title)
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
    item = asset(slug, title)
    ready_signal, select_signal = f"booted_{slug}", f"selected_{slug}"
    auto_id, ready_id, select_id = f"auto_boot_{slug}", f"on_booted_{slug}", f"on_selected_{slug}"
    phase, ready, accepted = f"phase_{slug}", f"ready_{slug}", f"accepted_{slug}"
    intent = reviewed_intent("complex_coordination", index, title)
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


def choice_case(index: int, slug: str, title: str) -> dict[str, Any]:
    variable = f"choice_confirmed_{slug}"
    intent = reviewed_intent("choice", index, title)
    case = case_base(
        f"choice-{slug}", "choice", intent, [], ["SHOW_CHOICES", "SET_VARIABLE"],
        {
            "actions": [{"type": "choose", "target_selector": {"command_type": "SHOW_CHOICES"}, "index": 0}],
            "assertions": [{"type": "variable_changed_after_actions", "value": True}],
        },
    )
    case["reference_output"] = {
        "intent": intent, "asset_catalog": [],
        "commands": [command(
            f"choices_{slug}", "SHOW_CHOICES", elementId=f"choice_menu_{slug}", blocking=True,
            position={"x": 180, "y": 330},
            ui={"rowMax": 2, "fontSize": 22, "paddingX": 18, "paddingY": 12, "zIndex": 100},
            options=[
                {"id": "confirm", "text": "现在确认", "commands": [command(f"set_{variable}", "SET_VARIABLE", key=variable, op="set", value=True)]},
                {"id": "later", "text": "稍后处理", "commands": []},
            ],
        )],
        "extra_events": [],
    }
    return case


def presentation_sequence_case(index: int, slug: str, title: str, element: str) -> dict[str, Any]:
    image = asset(slug, title)
    sound = audio_asset(f"{slug}_prompt", f"{title}提示音")
    variable = f"presented_{slug}"
    intent = reviewed_intent("presentation_sequence", index, title)
    case = case_base(
        f"presentation-{slug}", "presentation_sequence", intent, [image, sound],
        ["SHOW_TEXT", "WAIT", "SE_PLAY", "SHOW_IMAGE", "SET_VARIABLE"],
        {
            "actions": [{"type": "advance_frames", "frames": 1}],
            "assertions": [
                {"type": "element_exists", "target_selector": {"command_type": "SHOW_IMAGE"}},
                {"type": "truthy_variable_count", "minimum": 1},
            ],
        },
    )
    case["reference_output"] = {
        "intent": intent, "asset_catalog": deepcopy(case["asset_catalog"]),
        "commands": [
            command(f"text_{slug}", "SHOW_TEXT", elementId=f"presentation_text_{slug}", text=f"即将展示{title}", position={"x": 160, "y": 90}, style={"fontSize": "26px", "color": "#ffffff", "zIndex": 110}, blocking=False),
            command(f"wait_{slug}", "WAIT", duration=250),
            command(f"sound_{slug}", "SE_PLAY", soundId=sound["id"], volume=0.8, loop=False),
            command(f"image_{slug}", "SHOW_IMAGE", elementId=element, resourceId=image["id"], position={"x": 280, "y": 190}, size={"width": 240, "height": 180}, zIndex=100),
            command(f"set_{variable}", "SET_VARIABLE", key=variable, op="set", value=True),
        ],
        "extra_events": [],
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
        cases.append(choice_case(index, slug, title))
        cases.append(presentation_sequence_case(index, slug, title, f"presentation_{element}"))
    return {
        "schema_version": "vibe-interaction-event-eval-v4-heldout",
        "description": "100 reviewed, independently authored held-out authoring, interaction, and event cases with canonical VGE-DSL prompts. No training corpus or training assets are read or reused.",
        "system": "The runtime evaluator supplies the editor's canonical prompt guide.",
        "cases": cases,
    }
