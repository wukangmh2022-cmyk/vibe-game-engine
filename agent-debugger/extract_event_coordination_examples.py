#!/usr/bin/env python3
"""Extract first-level multi-event coordination patterns without calling an API."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

from build_command_db import ROOT as REPO_ROOT
from curriculum_plan import PREFERRED_FAMILIES

SCENE_DIR = REPO_ROOT / "customer-demo" / "scene"
OUTPUT_PATH = REPO_ROOT / "training-data" / "event-coordination-sft.json"
NESTED_COMMAND_FIELDS = ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands")


def iter_commands(commands: list[Any], path: str = "commands") -> Iterator[tuple[str, dict[str, Any]]]:
    for index, command in enumerate(commands):
        if not isinstance(command, dict):
            continue
        command_path = f"{path}/{index}"
        yield command_path, command
        params = command.get("parameters")
        if not isinstance(params, dict):
            continue
        for field in NESTED_COMMAND_FIELDS:
            if isinstance(params.get(field), list):
                yield from iter_commands(params[field], f"{command_path}/{field}")
        for option_index, option in enumerate(params.get("options") or []):
            if isinstance(option, dict) and isinstance(option.get("commands"), list):
                yield from iter_commands(option["commands"], f"{command_path}/options/{option_index}")


def command_summary(command: dict[str, Any]) -> dict[str, Any]:
    params = command.get("parameters") if isinstance(command.get("parameters"), dict) else {}
    result = {"id": command.get("id"), "type": command.get("type"), "parameters": params}
    return result


def event_trigger_targets(event: dict[str, Any]) -> list[str]:
    targets: list[str] = []
    for trigger in event.get("triggers") or []:
        if not isinstance(trigger, dict) or trigger.get("type") != "custom":
            continue
        target = trigger.get("target")
        if isinstance(target, str) and target:
            targets.append(target)
    return targets


def generic_intent(signal: str, producer_kind: str, consumer: dict[str, Any]) -> str:
    types = {str(command.get("type")) for _, command in iter_commands(consumer.get("commands") or [])}
    if "NEXT_LEVEL" in types or "SCENE_REDIRECT" in types:
        action = "在流程完成后处理通关或重试跳转"
    elif "SHOW_CHOICES" in types or "SET_SELECTABLE" in types or "SET_CLICKABLE" in types:
        action = "在独立交互事件中展示并管理玩家作答"
    elif "LOOP" in types or "JUMP_TO" in types:
        action = "启动独立的循环或计时流程"
    elif "FIREWORK_BURST" in types or "ANIMATE_OUT" in types:
        action = "在独立事件中处理反馈动画和状态收尾"
    elif "IF_CONDITION" in types:
        action = "在独立事件中按状态分支处理结果"
    else:
        action = "在独立事件中更新界面与状态"
    source = "主流程" if producer_kind == "main" else "另一个事件"
    return f"让{source}发出信号后，{action}；事件之间通过信号解耦，不把所有指令塞进同一条主流程。这个需求需要跨事件协同。"


def output_event(event: dict[str, Any]) -> dict[str, Any]:
    commands = event.get("commands") if isinstance(event.get("commands"), list) else []
    return {
        "id": event.get("id"),
        "name": event.get("name"),
        "triggers": event.get("triggers") or [],
        "command_types": [item.get("type") for _, item in iter_commands(commands)],
        "commands": [command_summary(item) for item in commands],
    }


def extract_scene_examples(scene_name: str) -> list[dict[str, Any]]:
    scene_path = SCENE_DIR / f"{scene_name}.json"
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    level = (scene.get("levels") or [])[0]
    if not isinstance(level, dict):
        return []
    events = [event for event in level.get("events") or [] if isinstance(event, dict)]
    receivers: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        for target in event_trigger_targets(event):
            receivers.setdefault(target, []).append(event)

    producers: list[tuple[str, str, list[Any]]] = [("main", "main", level.get("commands") or [])]
    producers.extend(("event", str(event.get("id")), event.get("commands") or []) for event in events)
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for producer_kind, producer_id, commands in producers:
        for command_path, command in iter_commands(commands):
            if command.get("type") != "EMIT_SIGNAL":
                continue
            params = command.get("parameters") if isinstance(command.get("parameters"), dict) else {}
            signal = params.get("signal")
            if not isinstance(signal, str) or not signal:
                continue
            for receiver in receivers.get(signal, []):
                key = (producer_id, signal, str(receiver.get("id")))
                if key in seen:
                    continue
                seen.add(key)
                producer_event = next((event for event in events if str(event.get("id")) == producer_id), None)
                source = {
                    "scene_file": scene_path.relative_to(REPO_ROOT).as_posix(),
                    "level_index": 0,
                    "level_id": level.get("id"),
                    "producer_scope": producer_kind,
                    "producer_event_id": producer_id if producer_kind == "event" else None,
                    "producer_command_path": command_path,
                    "consumer_event_id": receiver.get("id"),
                }
                candidates.append({
                    "input": {"intent": generic_intent(signal, producer_kind, receiver)},
                    "concepts": ["custom_event", "emit_signal", "independent_event_instance", "shared_level_state"],
                    "output": {
                        "commands": [command_summary(command)],
                        "extra_events": [output_event(receiver)],
                    },
                    "source_evidence": source,
                    "annotation": {
                        "coordination_pattern": "signal_routed_event",
                        "signal": signal,
                        "producer_scope": producer_kind,
                        "runtime_semantics": "The runtime registers every event trigger first. EMIT_SIGNAL starts the matching event command list asynchronously in its own temporary event instance; it does not append those commands to the producer list.",
                    },
                })

    # Keep three direct source edges, then derive three labeled generalizations
    # from real listeners. A first level often has only three distinct edges;
    # pretending otherwise would turn duplicate evidence into fake examples.
    selected: list[dict[str, Any]] = []
    covered_consumers: set[str] = set()
    for candidate in candidates:
        consumer_id = str(candidate["source_evidence"]["consumer_event_id"])
        if consumer_id in covered_consumers:
            continue
        selected.append(candidate)
        covered_consumers.add(consumer_id)
        if len(selected) == 3:
            break

    # Preserve a listener-only case when a level has fewer than three emitted
    # signals, then use those true listeners as sources for derived variations.
    if len(selected) < 3:
        for event in events:
            if len(selected) == 3:
                break
            if not event_trigger_targets(event):
                continue
            if str(event.get("id")) in covered_consumers:
                continue
            selected.append({
                "input": {"intent": "为当前关卡添加一个独立的自定义事件：它等待指定信号，再单独执行自己的交互与状态更新流程。这个需求需要跨事件协同。"},
                "concepts": ["custom_event", "event_listener", "independent_event_instance"],
                "output": {"commands": [], "extra_events": [output_event(event)]},
                "annotation": {"coordination_pattern": "independent_signal_listener", "runtime_semantics": "This listener is registered with the level. It stays idle until its custom trigger is emitted and can run separately from the primary command list."},
                "source_evidence": {
                    "scene_file": scene_path.relative_to(REPO_ROOT).as_posix(),
                    "level_index": 0,
                    "level_id": level.get("id"),
                    "consumer_event_id": event.get("id"),
                },
            })
            covered_consumers.add(str(event.get("id")))

    derivation_intents = [
        "把当前关卡的交互结果交给独立监听事件处理，让主流程保持简洁；这个需求需要跨事件协同。",
        "在主流程继续运行时，让独立事件基于共享变量刷新反馈界面；这个需求需要跨事件协同。",
        "为当前关卡增加一个条件反馈事件，在收到流程信号后检查状态并执行自己的分支；这个需求需要跨事件协同。",
    ]
    listener_sources = [event for event in events if event_trigger_targets(event)]
    for index, intent in enumerate(derivation_intents):
        if not listener_sources:
            break
        event = listener_sources[index % len(listener_sources)]
        selected.append({
            "input": {"intent": intent},
            "concepts": ["custom_event", "shared_level_state", "derived_from_source"],
            "output": {"commands": [], "extra_events": [output_event(event)]},
            "annotation": {
                "coordination_pattern": "derived_event_generalization",
                "derivation": "A generalized task built from a real first-level listener; it is not presented as a separate source edge.",
                "runtime_semantics": "The event is registered separately from the main commands and activates only when its custom trigger is dispatched.",
            },
            "source_evidence": {
                "scene_file": scene_path.relative_to(REPO_ROOT).as_posix(),
                "level_index": 0,
                "level_id": level.get("id"),
                "consumer_event_id": event.get("id"),
            },
        })
    return selected[:6]


def main() -> int:
    examples: list[dict[str, Any]] = []
    for scene_name in PREFERRED_FAMILIES:
        for example in extract_scene_examples(scene_name):
            example["example_id"] = f"event-coordination-{len(examples) + 1:03d}"
            example["source_scene_family"] = scene_name
            examples.append(example)
    document = {
        "schema_version": "event-coordination-sft-v1",
        "purpose": "Teach level.events coordination under the same commands + extra_events output contract as one-event samples.",
        "source_scope": "The first level from each of 15 authored scene files. Source scene names are evidence only and are excluded from input intents.",
        "runtime_contract": {
            "events": "Every event has its own commands array and one or more triggers.",
            "custom_trigger": "A custom event listens for a target signal.",
            "emit_signal": "EMIT_SIGNAL dispatches to matching listeners after event registration.",
            "concurrency": "Each matching custom event starts asynchronously in a separate temporary event instance; shared level variables and element IDs remain the coordination surface.",
        },
        "example_count": len(examples),
        "examples": examples,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "example_count": len(examples)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
