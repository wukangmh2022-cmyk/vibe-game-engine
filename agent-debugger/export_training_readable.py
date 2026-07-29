#!/usr/bin/env python3
"""Render JSONL level-authoring SFT records as a compact Chinese command outline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUTS = [
    ROOT / "training/qlora/data/level-authoring-sft-v3/train.jsonl",
    ROOT / "training/qlora/data/level-authoring-sft-v3/validation.jsonl",
]
DEFAULT_OUTPUT = ROOT / "training/qlora/data/level-authoring-sft-v3/readable-command-outline.txt"

COMMAND_NAMES = {
    "SET_VARIABLE": "设置变量", "SET_SWITCH": "设置开关", "WAIT": "等待", "JUMP_TO": "跳转至指令",
    "EMIT_SIGNAL": "发送信号", "IF_CONDITION": "条件判断", "LOOP": "循环", "BREAK": "退出循环",
    "CONTINUE": "继续循环", "RETURN": "返回", "SHOW_IMAGE": "显示图片", "SHOW_TEXT": "显示文本",
    "UPDATE_TEXT": "更新文本", "SHOW_BUTTON": "显示按钮", "SHOW_MEDIA": "显示媒体", "SHOW_CHOICES": "显示选项",
    "SET_ELEMENT_STYLE": "设置元素样式", "MOVE_TO": "移动元素", "SCALE_TO": "缩放元素", "ROTATE_TO": "旋转元素",
    "FLIP_CARD": "翻转卡片", "SET_CLICKABLE": "设置可点击", "SET_SELECTABLE": "设置可选中",
    "SET_DRAGGABLE": "设置可拖动", "CHECK_IN_AREA": "检查投放区域", "CHANGE_SELECTED_STATE": "改变选中状态",
    "ANIMATE_IN": "入场动画", "ANIMATE_LOOP": "循环动画", "ANIMATE_OUT": "退场动画", "STOP_ANIMATION": "停止动画",
    "FIREWORK_BURST": "播放烟花", "BGM_PLAY": "播放背景音乐", "BGM_STOP": "停止背景音乐",
    "BGM_PAUSE": "暂停背景音乐", "BGM_RESUME": "恢复背景音乐", "SE_PLAY": "播放音效", "SE_STOP": "停止音效",
    "NEXT_LEVEL": "进入下一关", "SCENE_REDIRECT": "跳转场景",
}
CHILD_FIELDS = (
    ("commands", "子命令"), ("trueCommands", "条件成立"), ("falseCommands", "条件不成立"),
    ("onSelectedCommands", "选中后"), ("onCancelSelectedCommands", "取消选中后"),
)


def command_label(command: dict[str, Any]) -> str:
    command_type = str(command.get("type") or "")
    return COMMAND_NAMES.get(command_type.upper(), f"未知指令：{command_type or '缺少类型'}")


def render_commands(commands: Any, indent: int = 1) -> Iterable[str]:
    if not isinstance(commands, list):
        return
    pad = "  " * indent
    for command in commands:
        if not isinstance(command, dict):
            yield f"{pad}无效指令"
            continue
        yield f"{pad}{command_label(command)}"
        parameters = command.get("parameters")
        if not isinstance(parameters, dict):
            continue
        for field, title in CHILD_FIELDS:
            nested = parameters.get(field)
            if isinstance(nested, list) and nested:
                yield f"{pad}  {title}："
                yield from render_commands(nested, indent + 2)
        for option_index, option in enumerate(parameters.get("options") or [], start=1):
            if isinstance(option, dict) and isinstance(option.get("commands"), list) and option["commands"]:
                yield f"{pad}  选项 {option_index} 后："
                yield from render_commands(option["commands"], indent + 2)


def event_heading(index: int, event: dict[str, Any]) -> str:
    trigger_types = []
    for trigger in event.get("triggers") or []:
        if not isinstance(trigger, dict):
            continue
        if trigger.get("type") == "auto":
            trigger_types.append("自动触发")
        elif trigger.get("type") == "custom":
            trigger_types.append("信号触发")
        else:
            trigger_types.append(str(trigger.get("type") or "未知触发器"))
    suffix = f"（{'、'.join(trigger_types)}）" if trigger_types else ""
    return f"事件 {index}{suffix}："


def assistant_payload(row: dict[str, Any]) -> dict[str, Any]:
    messages = row.get("messages") or []
    assistant = next((item.get("content") for item in reversed(messages) if item.get("role") == "assistant"), None)
    if not isinstance(assistant, str):
        raise ValueError("missing assistant JSON")
    payload = json.loads(assistant)
    if not isinstance(payload, dict):
        raise ValueError("assistant content is not an object")
    return payload


def render_row(row: dict[str, Any]) -> str:
    payload = assistant_payload(row)
    lines = [f"样本：{row.get('id', 'unknown')}", f"需求：{payload.get('intent', '')}", "主流程："]
    lines.extend(render_commands(payload.get("commands")))
    events = payload.get("extra_events") or []
    if not events:
        lines.append("事件：无")
    else:
        for index, event in enumerate(events, start=1):
            if not isinstance(event, dict):
                lines.append(f"事件 {index}：无效事件")
                continue
            lines.append(event_heading(index, event))
            lines.extend(render_commands(event.get("commands")))
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export SFT command order as Chinese plain text")
    parser.add_argument("--input", type=Path, nargs="+", default=DEFAULT_INPUTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    rendered: list[str] = []
    for path in args.input:
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                rendered.append(render_row(json.loads(line)))
            except (ValueError, json.JSONDecodeError, TypeError) as error:
                rendered.append(f"样本读取失败：{path.name}:{line_number}\n错误：{error}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n\n\n\n".join(rendered) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "samples": len(rendered)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
