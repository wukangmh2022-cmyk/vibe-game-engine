from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "agent-debugger"))

from training.qlora.audit_training_quality import (
    blinded_position,
    judge_messages,
    local_check,
    validate_judgment,
)


class TrainingQualityAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.converted = {
            "source_id": "sample-1",
            "intent": "显示图片后移动",
            "asset_catalog": [{"id": "图", "type": "image", "path": "images/a.png"}],
        }

    def test_blinded_position_is_deterministic(self) -> None:
        self.assertEqual(blinded_position("sample-1"), blinded_position("sample-1"))
        self.assertIn(blinded_position("sample-1"), {"A", "B"})

    def test_local_check_reports_parse_failure(self) -> None:
        result = local_check("IMAGE card 图\n   MOVE card 10 10", self.converted)
        self.assertFalse(result["parse_valid"])
        self.assertFalse(result["static_valid"])
        self.assertTrue(result["errors"])

    def test_local_check_accepts_quoted_unicode_resource(self) -> None:
        result = local_check('IMAGE card "图" x=0 y=0\nMOVE card 10 10', self.converted)
        self.assertTrue(result["parse_valid"])
        self.assertTrue(result["static_valid"])

    def test_local_check_rejects_css_style_keys(self) -> None:
        result = local_check('TEXT label "正确"\nSTYLE label {"font-size":"48px"}', self.converted)
        self.assertTrue(result["parse_valid"])
        self.assertFalse(result["static_valid"])
        self.assertTrue(any("CSS-style" in error for error in result["errors"]))

    def test_judgment_schema_rejects_unknown_winner(self) -> None:
        with self.assertRaisesRegex(ValueError, "winner"):
            validate_judgment({"winner": "gold", "confidence": 1, "reason": "x"})

    def test_judgment_schema_normalizes_arrays(self) -> None:
        result = validate_judgment({
            "winner": "tie",
            "confidence": 0.5,
            "reason": "同等",
            "a_missing_requirements": [],
            "b_missing_requirements": [],
            "a_errors": [],
            "b_errors": [],
        })
        self.assertEqual(result["winner"], "tie")
        self.assertEqual(result["suggested_better_response"], "")

    def test_gold_position_changes_only_candidate_order(self) -> None:
        row = {
            "source_id": "sample-1",
            "messages": [
                {"role": "system", "content": "system"},
                {"role": "user", "content": "user"},
                {"role": "assistant", "content": "gold"},
            ],
        }
        messages, position = judge_messages(row, "gold", "candidate", {"kind": "gold"}, {"kind": "candidate"})
        self.assertEqual(messages[0]["role"], "system")
        payload = __import__("json").loads(messages[1]["content"])
        self.assertEqual(payload[f"candidate_{position}"], "gold")
        other = "B" if position == "A" else "A"
        self.assertEqual(payload[f"candidate_{other}"], "candidate")


if __name__ == "__main__":
    unittest.main()
