"""The behavior benchmark must accept every checked-in reference implementation."""

from __future__ import annotations

import sys
import unittest
from copy import deepcopy
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
        self.assertEqual(result["passed"], 80, result)

    def test_heldout_cases_neither_reuse_paths_nor_leak_reference_outputs(self) -> None:
        document = benchmark()
        self.assertEqual(len(document["cases"]), 80)
        for case in document["cases"]:
            self.assertEqual(case["test_partition"], "heldout-v3")
            self.assertTrue(all(str(asset["path"]).startswith("virtual://heldout-evaluation/") for asset in case["asset_catalog"]))
            user_content = make_messages(document, case)[1]["content"]
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
