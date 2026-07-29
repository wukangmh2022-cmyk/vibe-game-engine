"""Regression coverage for deterministic interactive runtime evaluation."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path


DEBUGGER = Path(__file__).resolve().parents[1]
RUNNER = DEBUGGER / "runtime_level_dry_run.js"
IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9ZwAAAABJRU5ErkJggg=="


def run_game(commands: list[dict[str, object]], actions: list[dict[str, object]], assertions: list[dict[str, object]], events: list[dict[str, object]] | None = None) -> dict[str, object]:
    game = {
        "id": "test", "resources": [{"id": "card", "type": "image", "url": IMAGE}],
        "levels": [{"id": "level", "commands": commands, "events": events or []}],
    }
    completed = subprocess.run(
        ["node", str(RUNNER)], cwd=DEBUGGER.parent,
        input=json.dumps({"game": game, "evaluation": {"actions": actions, "assertions": assertions}}),
        text=True, capture_output=True, check=False, timeout=10,
    )
    if completed.returncode:
        raise AssertionError(completed.stderr)
    return json.loads(completed.stdout)


class InteractionRuntimeTest(unittest.TestCase):
    def test_choose_resolves_blocking_choices_and_executes_selected_branch(self) -> None:
        result = run_game(
            [{"id": "menu", "type": "SHOW_CHOICES", "parameters": {"elementId": "answer_menu", "blocking": True, "options": [
                {"id": "yes", "text": "确认", "commands": [{"id": "accepted", "type": "SET_VARIABLE", "parameters": {"key": "accepted", "op": "set", "value": True}}]},
                {"id": "no", "text": "取消", "commands": [{"id": "rejected", "type": "SET_VARIABLE", "parameters": {"key": "accepted", "op": "set", "value": False}}]},
            ]}}],
            [{"type": "choose", "target": "answer_menu", "index": 0}],
            [{"type": "variable_equals", "name": "accepted", "value": True}],
        )
        self.assertTrue(result["valid"], result)
        self.assertTrue(result["interaction"]["passed"], result)

    def test_tap_executes_nested_commands_and_custom_event(self) -> None:
        result = run_game(
            [
                {"id": "show", "type": "SHOW_IMAGE", "parameters": {"elementId": "card_a", "resourceId": "card"}},
                {"id": "click", "type": "SET_CLICKABLE", "parameters": {"elementId": "card_a", "onClick": "commands", "commands": [
                    {"id": "emit", "type": "EMIT_SIGNAL", "parameters": {"signal": "chosen"}},
                ]}},
            ],
            [{"type": "tap", "target": "card_a"}],
            [{"type": "variable_changed_after_actions", "value": True}, {"type": "event_executed", "eventId": "on_chosen"}],
            [{"id": "on_chosen", "name": "chosen", "triggers": [{"type": "custom", "target": "chosen"}], "commands": [
                {"id": "set", "type": "SET_VARIABLE", "parameters": {"key": "handled", "op": "set", "value": True}},
            ]}],
        )
        self.assertTrue(result["valid"], result)
        self.assertTrue(result["interaction"]["passed"], result)

    def test_drag_uses_real_pointer_handlers_and_drop_watchers(self) -> None:
        result = run_game(
            [
                {"id": "show", "type": "SHOW_IMAGE", "parameters": {"elementId": "item", "resourceId": "card", "position": {"x": 20, "y": 20}, "size": {"width": 40, "height": 40}}},
                {"id": "drag", "type": "SET_DRAGGABLE", "parameters": {"elementId": "item", "draggable": True}},
                {"id": "area", "type": "CHECK_IN_AREA", "parameters": {"elementId": "item", "area": {"x": 400, "y": 100, "width": 100, "height": 100}, "triggerMode": "once", "commands": [
                    {"id": "dropped", "type": "SET_VARIABLE", "parameters": {"key": "dropped", "op": "set", "value": True}},
                ]}},
            ],
            [{"type": "drag", "target": "item", "to": {"x": 450, "y": 150}}],
            [{"type": "variable_equals", "name": "dropped", "value": True}, {"type": "element_position", "target": "item", "x": 430, "y": 130, "tolerance": 2}],
        )
        self.assertTrue(result["valid"], result)

    def test_failed_oracle_marks_the_runtime_result_invalid(self) -> None:
        result = run_game(
            [{"id": "show", "type": "SHOW_IMAGE", "parameters": {"elementId": "card_a", "resourceId": "card"}}],
            [],
            [{"type": "variable_equals", "name": "never_set", "value": True}],
        )
        self.assertFalse(result["valid"])
        self.assertFalse(result["interaction"]["passed"])

    def test_preexisting_true_variable_does_not_satisfy_post_action_change(self) -> None:
        result = run_game(
            [{"id": "already_true", "type": "SET_VARIABLE", "parameters": {"key": "unrelated", "op": "set", "value": True}}],
            [{"type": "advance_frames", "frames": 1}],
            [{"type": "variable_changed_after_actions", "value": True}],
        )
        self.assertFalse(result["valid"], result)
        self.assertFalse(result["interaction"]["passed"], result)

    def test_runtime_waits_for_a_non_blocking_chained_custom_event_sequence(self) -> None:
        events = []
        for index in range(5):
            commands = [{"id": f"emit_{index}", "type": "EMIT_SIGNAL", "parameters": {"signal": f"signal_{index + 1}"}}]
            if index == 4:
                commands = [{"id": "complete", "type": "SET_VARIABLE", "parameters": {"key": "chain_complete", "op": "set", "value": True}}]
            events.append({"id": f"event_{index}", "name": f"事件 {index}", "triggers": [{"type": "custom", "target": f"signal_{index}"}], "commands": commands})
        result = run_game(
            [{"id": "start", "type": "EMIT_SIGNAL", "parameters": {"signal": "signal_0"}}],
            [],
            [{"type": "variable_equals", "name": "chain_complete", "value": True}, {"type": "event_execution_count", "count": 5, "exact": True}],
            events,
        )
        self.assertTrue(result["valid"], result)
        self.assertTrue(result["interaction"]["passed"], result)


if __name__ == "__main__":
    unittest.main()
