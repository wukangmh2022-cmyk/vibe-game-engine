"""The behavior benchmark must accept every checked-in reference implementation."""

from __future__ import annotations

import sys
import json
import unittest
from copy import deepcopy
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from training.eval.heldout_interaction_benchmark_v3 import benchmark
from training.eval.run_interaction_eval import make_messages, validate_output
from training.eval.verify_interaction_reference import verify


class InteractionBenchmarkReferenceTest(unittest.TestCase):
    def test_all_reference_implementations_pass(self) -> None:
        result = verify()
        self.assertEqual(result["failed"], 0, result)
        self.assertEqual(result["passed"], 100, result)

    def test_heldout_cases_neither_reuse_paths_nor_leak_reference_outputs(self) -> None:
        document = benchmark()
        self.assertEqual(len(document["cases"]), 100)
        for case in document["cases"]:
            self.assertEqual(case["test_partition"], "heldout-v4")
            self.assertTrue(all(str(asset["path"]).startswith("virtual://heldout-evaluation/") for asset in case["asset_catalog"]))
            user_content = make_messages(document, case)[1]["content"]
            self.assertTrue(user_content.startswith("TASK\n"))
            self.assertIn("\nCANVAS 800 600\nASSETS id | type | path\n", user_content)
            self.assertNotIn("reference_output", user_content)
            self.assertNotIn("oracle", user_content)
            # The model receives a product requirement, never an implementation
            # hint such as a DSL command, event trigger, or generated element ID.
            for forbidden in ("SET_", "EMIT_", "IF_CONDITION", "FLIP_CARD", "custom", "elementId"):
                self.assertNotIn(forbidden, case["intent"])
                self.assertNotIn(forbidden, user_content)

    def test_complex_coordination_cases_keep_multistep_event_contracts(self) -> None:
        complex_cases = [case for case in benchmark()["cases"] if case["category"] == "complex_coordination"]
        self.assertEqual(len(complex_cases), 10)
        for case in complex_cases:
            self.assertNotIn("独立", case["intent"])
            self.assertNotIn("后台", case["intent"])
            self.assertEqual(len(case["reference_output"]["extra_events"]), 3)

    def test_every_category_has_ten_distinct_reviewed_queries(self) -> None:
        document = benchmark()
        by_category: dict[str, list[str]] = {}
        for case in document["cases"]:
            by_category.setdefault(case["category"], []).append(case["intent"])
        self.assertEqual(set(map(len, by_category.values())), {10})
        self.assertEqual(len({case["intent"] for case in document["cases"]}), 100)
        self.assertTrue(all(20 <= len(case["intent"]) <= 100 for case in document["cases"]))

    def test_queries_match_product_style_without_copying_training_intents(self) -> None:
        source = ROOT / "training-data/level-authoring-sft-v4-runtime-passed.jsonl"
        training_intents = [
            str((json.loads(line).get("input") or {}).get("intent") or "")
            for line in source.read_text(encoding="utf-8").splitlines() if line.strip()
        ]
        heldout_intents = [case["intent"] for case in benchmark()["cases"]]
        self.assertFalse(set(heldout_intents) & set(training_intents))
        max_similarity = max(
            SequenceMatcher(None, heldout, training, autojunk=False).ratio()
            for heldout in heldout_intents for training in training_intents
        )
        self.assertLess(max_similarity, 0.70)

    def test_complex_case_requires_the_hidden_preparation_dependency(self) -> None:
        case = next(case for case in benchmark()["cases"] if case["id"] == "complex-archive")
        sample = deepcopy(case["reference_output"])
        # The automatic event no longer notifies its listener; an independent
        # true variable must not be accepted as evidence of coordination.
        sample["extra_events"][0]["commands"] = [{
            "id": "unrelated_ready", "type": "SET_VARIABLE",
            "parameters": {"key": "unrelated", "op": "set", "value": True},
        }]
        result = validate_output(sample, case)
        self.assertFalse(result["valid"], result)
        self.assertIn("complex coordination requires an automatic preparation chain", result["errors"])


if __name__ == "__main__":
    unittest.main()
