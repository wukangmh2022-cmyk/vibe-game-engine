from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from training.eval.semantic_judge import aggregate_judgments, normalize_judgment, parse_json_object
from training.eval.run_semantic_judge import make_summary


def judgment(decision: str, score: int) -> dict[str, object]:
    return {
        "requirements": [{"requirement": "可以点击", "verdict": "met", "evidence": "pointertap 后状态变化"}],
        "dimensions": {
            name: {"score": score, "evidence": f"{name} evidence"}
            for name in (
                "requirement_coverage", "behavioral_correctness", "resource_grounding",
                "interaction_feedback", "layout_presentation", "scope_control",
            )
        },
        "decision": decision, "confidence": 0.9, "rationale": "evidence is sufficient",
    }


class SemanticJudgeTest(unittest.TestCase):
    def test_normalizes_fenced_json(self) -> None:
        value = normalize_judgment(parse_json_object("```json\n" + __import__("json").dumps(judgment("pass", 9)) + "\n```"))
        self.assertEqual(value["decision"], "pass")
        self.assertEqual(value["semantic_score"], 9.0)
        self.assertTrue(value["decision_consistent"])

    def test_only_unanimous_low_variance_pass_is_accepted(self) -> None:
        records = [{"judgment": normalize_judgment(judgment("pass", score))} for score in (8, 9, 9)]
        self.assertEqual(aggregate_judgments(records, 3)["aggregate_decision"], "pass")
        mixed = records[:2] + [{"judgment": normalize_judgment(judgment("review", 6))}]
        self.assertEqual(aggregate_judgments(mixed, 3)["aggregate_decision"], "review")

    def test_missing_judge_response_requires_human_review(self) -> None:
        result = aggregate_judgments([{"judgment": normalize_judgment(judgment("pass", 9))}, {"error": "timeout"}], 3)
        self.assertTrue(result["needs_human_review"])

    def test_inconsistent_raw_decision_requires_review(self) -> None:
        inconsistent = normalize_judgment(judgment("fail", 9))
        self.assertEqual(inconsistent["decision"], "pass")
        self.assertFalse(inconsistent["decision_consistent"])
        result = aggregate_judgments([{"judgment": inconsistent}] * 3, 3)
        self.assertEqual(result["aggregate_decision"], "review")

    def test_local_run_labels_are_grouped_without_entering_judge_messages(self) -> None:
        aggregate = aggregate_judgments([
            {"judgment": normalize_judgment(judgment("pass", 9))} for _ in range(3)
        ], 3)
        records = [
            {"run": "base", "hard_runtime_passed": True, "combined_passed": True, "aggregate": aggregate},
            {"run": "adapter", "hard_runtime_passed": True, "combined_passed": True, "aggregate": aggregate},
        ]
        summary = make_summary(records)
        self.assertEqual(summary["by_run"]["base"]["combined_passed"], 1)
        self.assertEqual(summary["by_run"]["adapter"]["mean_semantic_score"], 9.0)


if __name__ == "__main__":
    unittest.main()
