"""Endpoint profiles are local-only and may use independent model servers."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from training.eval.eval_config import endpoint_from_profile, read_env_file
from training.eval.run_eval import make_messages as make_command_messages
from training.eval.run_interaction_eval import make_messages as make_interaction_messages


class EvaluationConfigTest(unittest.TestCase):
    def test_reads_independent_qwen_and_adapter_profiles(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                "VIBE_EVAL_QWEN36_27B_API_BASE=https://base.example/v1\n"
                "VIBE_EVAL_QWEN36_27B_API_KEY=base-key\n"
                "VIBE_EVAL_QWEN36_27B_MODEL=Qwen3.6-27B\n"
                "VIBE_EVAL_ADAPTER_API_BASE=https://adapter.example/v1\n"
                "VIBE_EVAL_ADAPTER_API_KEY=adapter-key\n"
                "VIBE_EVAL_ADAPTER_MODEL=Vibe-Adapter\n",
                encoding="utf-8",
            )
            values = read_env_file(path)
        base = endpoint_from_profile("qwen36_27b", values)
        adapter = endpoint_from_profile("adapter", values)
        self.assertEqual(base["api_base"], "https://base.example/v1")
        self.assertEqual(base["model"], "Qwen3.6-27B")
        self.assertEqual(adapter["api_base"], "https://adapter.example/v1")
        self.assertEqual(adapter["model"], "Vibe-Adapter")

    def test_without_guidance_keeps_the_same_user_task(self) -> None:
        command_case = {
            "id": "command-1", "primary_command_type": "SHOW_TEXT", "sample_mode": "atomic",
            "intent": "显示欢迎文字", "asset_catalog": [],
        }
        interaction_case = {"id": "interaction-1", "intent": "显示欢迎文字", "asset_catalog": []}
        command_full = make_command_messages({}, command_case)
        command_without = make_command_messages({}, command_case, "none")
        interaction_full = make_interaction_messages({}, interaction_case)
        interaction_without = make_interaction_messages({}, interaction_case, "none")
        self.assertEqual(command_full[-1], command_without[-1])
        self.assertEqual(interaction_full[-1], interaction_without[-1])
        self.assertEqual(len(command_full), 2)
        self.assertEqual(len(interaction_full), 2)
        self.assertEqual(len(command_without), 1)
        self.assertEqual(len(interaction_without), 1)


if __name__ == "__main__":
    unittest.main()
