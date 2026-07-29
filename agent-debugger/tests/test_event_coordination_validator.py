from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path

DEBUGGER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEBUGGER))

from event_coordination_validator import EventCoordinationValidator, validate_jsonl


class EventCoordinationValidatorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.validator = EventCoordinationValidator()

    def test_accepts_connected_timer_with_element_and_exit(self) -> None:
        sample = {
            "input": {"asset_catalog": []},
            "output": {
                "commands": [
                    {"id": "timer-text", "type": "SHOW_TEXT", "parameters": {"elementId": "timer", "text": "10"}},
                    {"id": "timer-init", "type": "SET_VARIABLE", "parameters": {"key": "seconds", "op": "set", "value": 10}},
                    {"id": "timer-start", "type": "EMIT_SIGNAL", "parameters": {"signal": "timer_started"}},
                ],
                "extra_events": [{
                    "id": "timer-event", "name": "倒计时", "triggers": [{"type": "custom", "target": "timer_started"}],
                    "commands": [{"id": "timer-loop", "type": "LOOP", "parameters": {
                        "loopType": "while", "condition": {"type": "variable", "key": "seconds", "operator": "gt", "value": 0},
                        "commands": [
                            {"id": "timer-wait", "type": "WAIT", "parameters": {"duration": 1000}},
                            {"id": "timer-sub", "type": "SET_VARIABLE", "parameters": {"key": "seconds", "op": "sub", "value": 1}},
                            {"id": "timer-update", "type": "UPDATE_TEXT", "parameters": {"elementId": "timer", "text": "{seconds}"}},
                        ],
                    }}],
                }],
            },
        }
        result = self.validator.validate(sample)
        self.assertTrue(result["valid"], result)

    def test_rejects_listener_without_producer_and_extra_fields(self) -> None:
        sample = {
            "output": {
                "commands": [{"id": "show", "type": "SHOW_TEXT", "parameters": {"elementId": "tip", "text": "开始"}}],
                "extra_events": [{
                    "id": "listener", "name": "监听", "command_types": ["SHOW_TEXT"],
                    "triggers": [{"type": "custom", "target": "never_emitted"}],
                    "commands": [{"id": "help", "type": "SHOW_TEXT", "parameters": {"elementId": "help", "text": "帮助"}}],
                }],
            },
        }
        result = self.validator.validate(sample)
        self.assertFalse(result["valid"])
        self.assertIn("event listener listens for signal never_emitted but this output never emits it", result["errors"])
        self.assertIn("extra_events[0] has unsupported EventConfig fields: command_types", result["errors"])

    def test_level_context_allows_existing_element_and_external_event(self) -> None:
        sample = {
            "output": {
                "commands": [
                    {"id": "refresh_score", "type": "UPDATE_TEXT", "parameters": {"elementId": "existing-score", "text": "10"}},
                    {"id": "notify_existing_event", "type": "EMIT_SIGNAL", "parameters": {"signal": "existing_event"}},
                ],
            },
        }
        result = self.validator.validate(sample, mode="level_context")
        self.assertTrue(result["valid"], result)
        self.assertIn("refresh_score references elementId that is not created in this output: existing-score", result["warnings"])
        self.assertIn("signal existing_event has no custom-event listener in this output", result["warnings"])

    def test_jsonl_audit_preserves_line_oriented_samples(self) -> None:
        record = {"sample_id": "existing-command", "output": {"commands": [{"id": "show", "type": "SHOW_TEXT", "parameters": {"elementId": "tip", "text": "开始"}}]}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "corpus.jsonl"
            path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")
            result = validate_jsonl(path, "level_context")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["valid"], 1)

    def test_complete_patch_requires_variable_definition_and_resource_type(self) -> None:
        sample = {
            "input": {"asset_catalog": [{"id": "not-audio", "type": "image"}]},
            "output": {
                "commands": [{"id": "start", "type": "EMIT_SIGNAL", "parameters": {"signal": "go"}}],
                "extra_events": [{"id": "event", "name": "检查", "triggers": [{"type": "custom", "target": "go"}], "commands": [
                    {"id": "gate", "type": "IF_CONDITION", "parameters": {"condition": {"type": "variable", "key": "missing", "operator": "gt", "value": 0}, "trueCommands": [{"id": "sound", "type": "SE_PLAY", "parameters": {"soundId": "not-audio"}}], "falseCommands": []}},
                ]}],
            },
        }
        result = self.validator.validate(sample)
        self.assertFalse(result["valid"])
        self.assertIn("gate reads variable that is not initialized in this output: missing", result["errors"])
        self.assertIn("resource not-audio at extra_events[0].commands[0].parameters.trueCommands[0].parameters.soundId must have type audio, got image", result["errors"])

    def test_complete_patch_rejects_missing_declared_asset_path(self) -> None:
        sample = {
            "input": {"asset_catalog": [{"id": "audio", "type": "audio", "path": "audio/does-not-exist.ogg", "origin": "existing", "exists": True}]},
            "output": {"commands": [{"id": "go", "type": "EMIT_SIGNAL", "parameters": {"signal": "start"}}], "extra_events": [
                {"id": "event", "name": "播放", "triggers": [{"type": "custom", "target": "start"}], "commands": [{"id": "play", "type": "SE_PLAY", "parameters": {"soundId": "audio"}}]},
            ]},
        }
        result = self.validator.validate(sample)
        self.assertFalse(result["valid"])
        self.assertIn("asset audio path is missing from customer-demo: audio/does-not-exist.ogg", result["errors"])

    def test_complete_patch_rejects_javascript_style_variable_interpolation(self) -> None:
        sample = {
            "output": {
                "commands": [{"id": "show", "type": "SHOW_TEXT", "parameters": {"elementId": "score", "text": "得分 ${score}"}}],
                "extra_events": [{"id": "event", "name": "事件", "triggers": [{"type": "auto", "start": "immediate"}], "commands": [{"id": "set", "type": "SET_VARIABLE", "parameters": {"key": "score", "op": "set", "value": 0}}]}],
            },
        }
        result = self.validator.validate(sample)
        self.assertFalse(result["valid"])
        self.assertIn("show uses unsupported ${...} interpolation; runtime requires {variableKey}", result["errors"])


if __name__ == "__main__":
    unittest.main()
