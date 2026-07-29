"""Regression tests for local acceptance and generic curriculum wording."""

from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

DEBUGGER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEBUGGER))

import command_synthesize as synth
import task_queue


class SynthesisAcceptanceTest(unittest.TestCase):
    def test_parse_json_object_accepts_fenced_json(self) -> None:
        sample = synth.parse_json_object("```json\n{\"intent\": \"显示提示\", \"commands\": []}\n```")
        self.assertEqual(sample["intent"], "显示提示")

    def test_jobs_hide_source_scene_from_intent_seed(self) -> None:
        slot = {
            "slot": 1,
            "plan_id": "g0001",
            "primary_command_type": "MOVE_TO",
            "sample_mode": "motif",
            "template_id": "move_style",
            "angle_zh": "资源揭示",
            "scene_family": "记忆衣橱",
            "level_name": "关卡3-2",
            "level_key": "scene/记忆衣橱.json::7::level1",
            "intent_seed": "创建图片，移动，再改样式，用于记忆衣橱的资源揭示",
        }
        job = synth.make_jobs_from_plan([slot])[0]
        self.assertIn("当前关卡", job["plan"]["intent_seed"])
        self.assertNotIn("记忆衣橱", job["plan"]["intent_seed"])
        self.assertNotIn("关卡3-2", job["plan"]["intent_seed"])

    def test_normalize_training_intent_removes_source_names(self) -> None:
        value = synth.normalize_training_intent("在记忆衣橱关卡3-2里播放提示音", {"scene_family": "记忆衣橱", "level_name": "关卡3-2"})
        self.assertEqual(value, "在当前关卡里播放提示音")

    def test_direct_json_response_is_accepted_locally(self) -> None:
        sample = {"intent": "在当前关卡显示提示", "asset_catalog": [], "commands": [{"id": "show", "type": "SHOW_TEXT", "parameters": {"elementId": "tip", "text": "开始"}}]}

        class Operator:
            source_examples: list[str] = []
            def __init__(self, *_: object) -> None: pass
            def finish(self, value: dict[str, object]) -> dict[str, object]:
                return {"accepted": True, "sample": value, "validation": {"valid": True}}

        response = {"choices": [{"message": {"content": "```json\n" + synth.json.dumps(sample, ensure_ascii=False) + "\n```"}}]}
        job = {"command_type": "SHOW_TEXT", "sample_mode": "atomic", "variant": 1, "plan": {"plan_id": "g-test", "template_id": "atomic_single"}}
        with patch.object(synth, "CommandToolOperator", Operator), patch.object(synth, "call_teacher", return_value=response):
            record, state = synth.run_job(1, job, Path("unused.sqlite"), {"max_actions": 8, "tool_protocol": "openai"}, "system")
        self.assertIsNotNone(record)
        self.assertEqual(state["status"], "success")
        self.assertEqual(record["plan_id"], "g-test")

    def test_queue_recovers_only_a_torn_final_jsonl_record(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "corpus.jsonl"
            complete = {"plan_id": "g0001", "value": "complete"}
            path.write_bytes((json.dumps(complete) + "\n{\"plan_id\": \"g0002\"").encode("utf-8"))
            result = task_queue.recover_jsonl_tail(path)
            self.assertGreater(result["truncated_bytes"], 0)
            self.assertEqual(path.read_text(encoding="utf-8"), json.dumps(complete) + "\n")

    def test_queue_preserves_a_complete_final_jsonl_record(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "corpus.jsonl"
            record = {"plan_id": "g0001", "value": "complete"}
            path.write_text(json.dumps(record), encoding="utf-8")
            self.assertEqual(task_queue.recover_jsonl_tail(path)["truncated_bytes"], 0)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), record)


if __name__ == "__main__":
    unittest.main()
