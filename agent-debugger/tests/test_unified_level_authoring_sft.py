"""Regression coverage for phase-1 to unified-schema migration."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


DEBUGGER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEBUGGER))

from build_unified_level_authoring_sft import normalize_commands


class UnifiedLevelAuthoringSftTest(unittest.TestCase):
    def test_normalizes_legacy_if_condition_aliases(self) -> None:
        commands = [{
            "id": "gate", "type": "IF_CONDITION",
            "parameters": {
                "condition": {"type": "variable", "variable": "score", "operator": "gte", "value": 3},
                "then": [{"id": "next", "type": "NEXT_LEVEL", "parameters": {}}],
                "else": [],
            },
        }]
        self.assertEqual(normalize_commands(commands), 1)
        parameters = commands[0]["parameters"]
        self.assertEqual(parameters["condition"]["key"], "score")
        self.assertNotIn("variable", parameters["condition"])
        self.assertEqual(parameters["trueCommands"][0]["id"], "next")
        self.assertEqual(parameters["falseCommands"], [])
        self.assertNotIn("then", parameters)
        self.assertNotIn("else", parameters)


if __name__ == "__main__":
    unittest.main()
