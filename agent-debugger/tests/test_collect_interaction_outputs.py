from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from training.eval.collect_interaction_outputs import append_record, completed_case_ids, seen_case_ids
from training.eval.heldout_interaction_benchmark_v3 import benchmark
from training.eval.run_interaction_eval import make_messages


class CollectInteractionOutputsTest(unittest.TestCase):
    def test_uses_the_canonical_v3_dsl_contract_as_runtime_evaluation(self) -> None:
        document = benchmark()
        messages = make_messages(document, document["cases"][0])
        self.assertIn("# VGE-DSL/1", messages[0]["content"])
        self.assertTrue(messages[1]["content"].startswith("TASK\n"))
        self.assertIn("\nCANVAS 800 600\nASSETS id | type | path\n", messages[1]["content"])
        self.assertNotIn("reference_output", messages[1]["content"])

    def test_append_is_resumable_by_case_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "generations.jsonl"
            append_record(path, {"case_id": "one", "raw_output": "{}"})
            append_record(path, {"case_id": "two", "request_error": "timeout"})
            self.assertEqual(seen_case_ids(path), {"one", "two"})
            rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(rows), 2)

    def test_request_errors_are_preserved_but_retried(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "generations.jsonl"
            append_record(path, {"case_id": "complete", "raw_output": "{}"})
            append_record(path, {"case_id": "retry", "request_error": "HTTP 502"})
            self.assertEqual(completed_case_ids(path), {"complete"})
            self.assertEqual(seen_case_ids(path), {"complete", "retry"})


if __name__ == "__main__":
    unittest.main()
