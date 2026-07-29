"""Developer-oriented wording preserved from the original v3 benchmark.

This is intentionally not the official generalization benchmark.  It keeps
the earlier implementation-explicit question style so its outcomes can be
compared with the natural-language version in heldout_interaction_benchmark_v3.
This diagnostic subset retains the original eight categories and 80 references;
the official natural-language v4 protocol additionally includes 20 authoring cases.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

try:
    from .heldout_interaction_benchmark_v3 import benchmark as natural_benchmark
except ImportError:  # Supports --cases /absolute/path/to/this_module.py.
    source = Path(__file__).with_name("heldout_interaction_benchmark_v3.py")
    spec = importlib.util.spec_from_file_location("vibe_interaction_benchmark_natural", source)
    if not spec or not spec.loader:
        raise RuntimeError(f"could not load natural-language benchmark at {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    natural_benchmark = module.benchmark


def params(command: dict[str, Any]) -> dict[str, Any]:
    return command.get("parameters") or {}


def technical_intent(case: dict[str, Any]) -> str:
    reference = case["reference_output"]
    commands = reference["commands"]
    category = case["category"]

    if category == "click":
        show, clickable = commands
        position, size = params(show)["position"], params(show)["size"]
        element = params(show)["elementId"]
        set_variable = params(clickable)["commands"][0]
        variable = params(set_variable)["key"]
        return f"创建 id 为 {element} 的图标，位置 x={position['x']},y={position['y']}，尺寸 {size['width']}x{size['height']}。玩家点击它后，把变量 {variable} 设置为 true。不要创建额外事件。"

    if category == "drag":
        show = commands[0]
        position, size = params(show)["position"], params(show)["size"]
        element = params(show)["elementId"]
        return f"创建 id 为 {element} 的图标，初始位置 x={position['x']},y={position['y']}，尺寸 {size['width']}x{size['height']}，并允许玩家拖动它。不要创建额外事件。"

    if category == "drop":
        show, _, check = commands
        position, size = params(show)["position"], params(show)["size"]
        element = params(show)["elementId"]
        area = params(check)["area"]
        variable = params(params(check)["commands"][0])["key"]
        return f"创建 id 为 {element} 的图标，初始位置 x={position['x']},y={position['y']}，尺寸 {size['width']}x{size['height']}，并允许拖动。当该元素放入区域 x={area['x']},y={area['y']},width={area['width']},height={area['height']} 时，把变量 {variable} 设置为 true；只触发一次。不要创建额外事件。"

    if category == "flip":
        show, flip = commands
        element = params(show)["elementId"]
        duration = params(flip)["duration"]
        return f"创建 id 为 {element} 的卡片正面，然后用 FLIP_CARD 将它翻到背面。翻面必须明确引用正面与背面资源，持续时间 {duration} 毫秒。不要创建额外事件。"

    if category == "click_event":
        show, clickable = commands
        element = params(show)["elementId"]
        signal = params(params(clickable)["commands"][0])["signal"]
        event = reference["extra_events"][0]
        variable = params(event["commands"][0])["key"]
        return f"创建 id 为 {element} 的图标。点击它时发送 {signal} 信号。额外创建 id 为 {event['id']} 的 custom 事件监听该信号，并将变量 {variable} 设置为 true。"

    if category == "selection":
        show = commands[0]
        element = params(show)["elementId"]
        return f"创建 id 为 {element} 的图标，并将它设置为可选中。玩家点击后应切换为选中状态。不要创建额外事件。"

    if category == "auto_event":
        show = commands[0]
        element = params(show)["elementId"]
        auto_event, listener = reference["extra_events"]
        signal = params(auto_event["commands"][0])["signal"]
        variable = params(listener["commands"][0])["key"]
        return f"主事件创建 id 为 {element} 的图标。额外创建 id 为 {auto_event['id']} 的 immediate auto 事件，它发送 {signal} 信号；再创建 id 为 {listener['id']} 的 custom 事件监听该信号，并把变量 {variable} 设置为 true。"

    if category == "complex_coordination":
        initialize, show, clickable = commands
        element = params(show)["elementId"]
        phase = params(initialize)["key"]
        auto_event, ready_event, select_event = reference["extra_events"]
        ready_signal = params(auto_event["commands"][0])["signal"]
        ready = params(ready_event["commands"][0])["key"]
        select_signal = params(params(clickable)["commands"][0])["signal"]
        condition = params(select_event["commands"][0])
        accepted = params(condition["trueCommands"][0])["key"]
        return (
            f"创建完整交互流程：先初始化变量 {phase}=0，然后显示 id 为 {element} 的图标，"
            f"然后创建 id 为 {auto_event['id']} 的 immediate auto 事件并发送 {ready_signal}，"
            f"然后创建 id 为 {ready_event['id']} 的 custom 事件监听该信号并将 {ready}=true，"
            f"然后让玩家点击 {element} 时发送 {select_signal}，"
            f"然后创建 id 为 {select_event['id']} 的 custom 事件监听该信号，"
            f"然后判断 {ready} 是否为 true：是则将 {accepted}=true，否则将 {accepted}=false。"
        )

    raise ValueError(f"unknown benchmark category: {category}")


def benchmark() -> dict[str, Any]:
    document = natural_benchmark()
    document["cases"] = [case for case in document["cases"] if case["category"] not in {"choice", "presentation_sequence"}]
    document["schema_version"] = "vibe-interaction-event-eval-v4-technical-baseline"
    document["description"] = "80 held-out cases using implementation-explicit wording. Compare only with the natural-language v4 protocol; do not treat it as the official generalization score."
    for case in document["cases"]:
        case["intent"] = technical_intent(case)
        case["reference_output"]["intent"] = case["intent"]
    return document
