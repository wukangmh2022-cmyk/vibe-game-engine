#!/usr/bin/env python3
"""Build an immutable, unified level-authoring SFT view from phases 1 and 2.

The phase-1 collection JSONL remains the raw acquisition record.  This builder
normalizes its output contract for training, repairs the known legacy
IF_CONDITION aliases, and combines it with the complete phase-2 event samples.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterable

from build_command_db import ROOT as REPO_ROOT
from event_coordination_validator import EventCoordinationValidator, validate_jsonl


PHASE1_PATH = REPO_ROOT / "training-data" / "command-agent-sft" / "corpus.jsonl"
PHASE2_PATH = REPO_ROOT / "training-data" / "event-coordination-sft-v2.json"
PHASE3_PATH = REPO_ROOT / "training-data" / "interaction-sft-v3.json"
OUTPUT_PATH = REPO_ROOT / "training-data" / "level-authoring-sft-v1.jsonl"
REPORT_PATH = REPO_ROOT / "training-data" / "level-authoring-sft-v1-validation.json"
MANIFEST_PATH = REPO_ROOT / "training-data" / "level-authoring-sft-v1-manifest.json"

NESTED_FIELDS = ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands")


def walk_commands(commands: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(commands, list):
        return
    for command in commands:
        if not isinstance(command, dict):
            continue
        yield command
        parameters = command.get("parameters")
        if not isinstance(parameters, dict):
            continue
        for field in NESTED_FIELDS:
            yield from walk_commands(parameters.get(field))
        for option in parameters.get("options") or []:
            if isinstance(option, dict):
                yield from walk_commands(option.get("commands"))


def normalize_if_condition(command: dict[str, Any]) -> bool:
    """Convert legacy aliases to the exact fields consumed by the runtime."""
    if str(command.get("type", "")).upper() != "IF_CONDITION":
        return False
    changed = False
    parameters = command.get("parameters")
    if not isinstance(parameters, dict):
        parameters = {}
        command["parameters"] = parameters
        changed = True

    # A few old candidates put branches beside parameters rather than inside it.
    for source, target in (("thenCommands", "trueCommands"), ("elseCommands", "falseCommands"), ("then", "trueCommands"), ("else", "falseCommands"), ("commands", "trueCommands")):
        value = parameters.pop(source, None)
        if value is None and source in command:
            value = command.pop(source)
        if value is not None and target not in parameters:
            parameters[target] = value
            changed = True
    for branch in ("trueCommands", "falseCommands"):
        if not isinstance(parameters.get(branch), list):
            parameters[branch] = []
            changed = True

    condition = parameters.get("condition")
    if not isinstance(condition, dict):
        return changed
    if condition.get("type") == "variable":
        if not condition.get("key") and isinstance(condition.get("variable"), str):
            condition["key"] = condition["variable"]
            changed = True
        if not condition.get("key") and isinstance(condition.get("left"), str):
            condition["key"] = condition["left"]
            changed = True
        if "value" not in condition and "right" in condition:
            condition["value"] = condition["right"]
            changed = True
        for alias in ("variable", "left", "right"):
            if alias in condition:
                del condition[alias]
                changed = True
    return changed


def normalize_commands(commands: list[dict[str, Any]]) -> int:
    changes = 0
    for command in walk_commands(commands):
        changes += int(normalize_if_condition(command))
    return changes


def move_following_command_into_true_branch(commands: list[dict[str, Any]], condition_id: str, following_id: str) -> bool:
    """Repair legacy motifs that expressed a gated transition as two siblings."""
    condition_index = next((index for index, item in enumerate(commands) if item.get("id") == condition_id), None)
    following_index = next((index for index, item in enumerate(commands) if item.get("id") == following_id), None)
    if condition_index is None or following_index is None:
        return False
    condition = commands[condition_index]
    parameters = condition.get("parameters") if isinstance(condition.get("parameters"), dict) else {}
    if parameters.get("trueCommands"):
        return False
    parameters["trueCommands"] = [commands.pop(following_index)]
    parameters.setdefault("falseCommands", [])
    condition["parameters"] = parameters
    return True


def repair_known_legacy_sample(plan_id: str, commands: list[dict[str, Any]]) -> int:
    """Apply minimal semantic repairs verified against each original intent."""
    changes = normalize_commands(commands)
    moves = {
        "g0014": ("cmd_check_score_gate", "cmd_next_level"),
        "g0068": ("cmd_check_threshold", "cmd_go_next_level"),
        "g0926": ("check-round-score", "go-next-level"),
        "g0854": ("check-wrong-threshold", "advance-after-wrong"),
        "g0887": ("check-score-threshold", "jump-to-score-sync"),
    }
    if plan_id in moves:
        condition_id, following_id = moves[plan_id]
        changes += int(move_following_command_into_true_branch(commands, condition_id, following_id))

    # g0047 had two dangling JUMP_TO commands with nonexistent targets.  Its
    # intent asks for a threshold-driven level advance, so use the real terminal
    # command rather than retaining an unresolvable control-flow example.
    if plan_id == "g0047":
        gate = next((item for item in commands if item.get("id") == "cmd_score_gate"), None)
        if gate:
            gate["parameters"]["trueCommands"] = [{"id": "cmd_next_level_on_pass", "type": "NEXT_LEVEL", "parameters": {}}]
            gate["parameters"]["falseCommands"] = []
            commands[:] = [item for item in commands if item.get("id") not in {"cmd_jump_fail", "cmd_jump_clear"}]
            changes += 1

    # g0541 used an expression-shaped condition without an expression.  The
    # recorded intent is an ordinary score threshold, so preserve that meaning
    # using the runtime's variable condition form.
    if plan_id == "g0541":
        gate = next((item for item in commands if item.get("id") == "if_score_gate_1"), None)
        if gate:
            gate["parameters"]["condition"] = {"type": "variable", "key": "score", "operator": "gt", "value": 100}
            changes += 1

    # g0523 duplicated the same NEXT_LEVEL id both inside the true branch and
    # as a sibling. Keep the intended conditional transition and repair the
    # malformed nested parameters object.
    if plan_id == "g0523":
        gate = next((item for item in commands if item.get("id") == "check-score-gate"), None)
        if gate:
            for nested in gate["parameters"].get("trueCommands", []):
                if nested.get("id") == "advance-after-score" and not isinstance(nested.get("parameters"), dict):
                    nested["parameters"] = {}
                    changes += 1
            before = len(commands)
            commands[:] = [item for item in commands if item.get("id") != "advance-after-score"]
            changes += int(len(commands) != before)
    return changes


def one_event_intent(intent: str) -> str:
    suffix = "该需求不需要跨事件协同。"
    return intent if "跨事件协同" in intent else f"{intent.rstrip('。')}。{suffix}"


def phase1_records(path: Path) -> tuple[list[dict[str, Any]], int]:
    records: list[dict[str, Any]] = []
    repaired = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        source = json.loads(raw)
        plan_id = source.get("plan_id")
        validation = source.get("validation")
        if not isinstance(plan_id, str) or not plan_id.startswith("g"):
            continue
        if not isinstance(validation, dict) or not validation.get("valid"):
            continue
        input_data = deepcopy(source.get("input") or {})
        output = deepcopy(source.get("output") or {})
        commands = output.get("commands")
        if not isinstance(commands, list):
            continue
        change_count = repair_known_legacy_sample(plan_id, commands)
        repaired += int(change_count > 0)
        output["extra_events"] = []
        input_data["intent"] = one_event_intent(str(input_data.get("intent") or ""))
        records.append({
            "schema_version": "vibe-level-authoring-sft-v1",
            "sample_id": f"phase1-{plan_id}",
            "source_dataset": "command-agent-sft-v1",
            "source_record_id": source.get("sample_id"),
            "plan_id": plan_id,
            "input": input_data,
            "output": output,
            "training_validation": {"phase": "phase1", "source_runtime_valid": bool((validation.get("runtime") or {}).get("valid")), "legacy_repairs_applied": change_count},
        })
    return records, repaired


def phase2_records(path: Path) -> list[dict[str, Any]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    records: list[dict[str, Any]] = []
    for source in document.get("examples") or []:
        records.append({
            "schema_version": "vibe-level-authoring-sft-v1",
            "sample_id": f"phase2-{source['example_id']}",
            "source_dataset": "event-coordination-sft-v2",
            "source_record_id": source["example_id"],
            "input": deepcopy(source["input"]),
            "output": deepcopy(source["output"]),
            "training_validation": {"phase": "phase2", "source_static_valid": True},
        })
    return records


def phase3_records(path: Path) -> list[dict[str, Any]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    records: list[dict[str, Any]] = []
    for source in document.get("examples") or []:
        records.append({
            "schema_version": "vibe-level-authoring-sft-v1",
            "sample_id": f"phase3-{source['example_id']}",
            "source_dataset": "interaction-sft-v3",
            "source_record_id": source["example_id"],
            "input": deepcopy(source["input"]),
            "output": deepcopy(source["output"]),
            "training_validation": {
                "phase": "phase3", "static_contract_valid": True,
                "browser_replay": "deferred", "teacher_api_used": False,
            },
        })
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the unified level-authoring SFT JSONL without rewriting source corpora")
    parser.add_argument("--phase1", type=Path, default=PHASE1_PATH)
    parser.add_argument("--phase2", type=Path, default=PHASE2_PATH)
    parser.add_argument("--phase3", type=Path, default=PHASE3_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()

    first, repaired = phase1_records(args.phase1)
    second = phase2_records(args.phase2)
    third = phase3_records(args.phase3)
    records = first + second + third
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    report = validate_jsonl(args.output, "level_context")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if report["invalid"]:
        raise SystemExit(f"unified corpus validation failed: {report['invalid']} invalid records")
    manifest = {
        "schema_version": "vibe-level-authoring-sft-v1-manifest",
        "output": str(args.output.relative_to(REPO_ROOT)),
        "sources": [str(args.phase1.relative_to(REPO_ROOT)), str(args.phase2.relative_to(REPO_ROOT)), str(args.phase3.relative_to(REPO_ROOT))],
        "total_records": len(records), "phase1_records": len(first), "phase2_records": len(second), "phase3_records": len(third),
        "phase1_legacy_records_repaired": repaired,
        "validation": {"validator": "agent-debugger/event_coordination_validator.py", "mode": "level_context", "valid": report["valid"], "invalid": report["invalid"]},
        "source_corpora_immutable": True,
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
