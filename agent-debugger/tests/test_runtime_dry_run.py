"""Regression tests for the executable sample preflight harness."""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path


DEBUGGER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEBUGGER))

from command_validator import RUNTIME_DRY_RUNNER


def run_dry_run(commands: list[dict[str, object]]) -> tuple[str, dict[str, object]]:
    result = subprocess.run(
        ["node", "-r", "ts-node/register/transpile-only", str(RUNTIME_DRY_RUNNER)],
        input=json.dumps({"commands": commands, "assets": []}),
        text=True,
        capture_output=True,
        check=False,
        cwd=RUNTIME_DRY_RUNNER.parent.parent,
        timeout=8,
    )
    return result.stdout, json.loads(result.stdout)


class RuntimeDryRunTest(unittest.TestCase):
    def test_show_choices_keeps_stdout_as_one_json_object(self) -> None:
        stdout, result = run_dry_run([{
            "id": "choice", "type": "SHOW_CHOICES",
            "parameters": {"elementId": "mode", "options": [{"text": "开始"}]},
        }])
        self.assertTrue(result["valid"])
        self.assertEqual(len(stdout.splitlines()), 1)
        self.assertTrue(stdout.startswith('{"valid":'))

    def test_atomic_bgm_stop_has_existing_playback_context(self) -> None:
        _, result = run_dry_run([{
            "id": "stop", "type": "BGM_STOP", "parameters": {},
        }])
        self.assertTrue(result["valid"])
        self.assertTrue(result["results"][0]["success"])


if __name__ == "__main__":
    unittest.main()
