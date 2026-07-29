"""Regression tests for the executable command-data quality gate."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

DEBUGGER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEBUGGER))

from command_db import CommandDatabase, build_command_database
from command_validator import CommandSampleValidator


class CommandValidatorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.project = DEBUGGER.parent / "customer-demo"
        cls.temp = tempfile.TemporaryDirectory()
        cls.database_path = Path(cls.temp.name) / "commands.sqlite"
        build_command_database(cls.project, cls.database_path)
        cls.database = CommandDatabase(cls.database_path)
        cls.metadata = cls.database.level_metadata("scene/entry.json::0::entry-level")
        cls.assets = {item["id"]: item for item in cls.metadata["resources"]}
        cls.validator = CommandSampleValidator(cls.database)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def test_accepts_real_image_that_executes(self) -> None:
        image = self.assets["____1"]
        sample = {
            "intent": "在入口画布左上角显示真实标题背景图片",
            "asset_catalog": [{**image, "origin": "existing", "exists": True, "metadata": {"status": "ready"}}],
            "commands": [{"id": "show_title", "type": "SHOW_IMAGE", "parameters": {"elementId": "title", "resourceId": image["id"], "position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}}}],
        }
        result = self.validator.validate(sample, "SHOW_IMAGE", 1, self.assets)
        self.assertTrue(result["valid"], result)
        self.assertTrue(result["runtime"]["valid"])

    def test_rejects_virtual_resource_from_executable_corpus(self) -> None:
        sample = {
            "intent": "在画布中显示一个未绑定的虚拟提示图标",
            "asset_catalog": [{"id": "virtual_tip", "type": "image", "path": "virtual://tip.png", "origin": "virtual", "exists": False, "metadata": {"status": "placeholder"}}],
            "commands": [{"id": "show_tip", "type": "SHOW_IMAGE", "parameters": {"elementId": "tip", "resourceId": "virtual_tip"}}],
        }
        result = self.validator.validate(sample, "SHOW_IMAGE", 1, self.assets)
        self.assertFalse(result["valid"])
        self.assertIn("executable corpus requires an existing asset: virtual_tip", result["errors"])

    def test_rejects_element_dependency_without_creator(self) -> None:
        sample = {
            "intent": "把未创建的元素移动到画布中央位置",
            "asset_catalog": [],
            "commands": [{"id": "move_missing", "type": "MOVE_TO", "parameters": {"elementId": "missing", "x": 100, "y": 100}}],
        }
        result = self.validator.validate(sample, "MOVE_TO", 1, self.assets)
        self.assertFalse(result["valid"])
        self.assertIn("move_missing references elementId before it is created", result["errors"])

    def test_rejects_compatibility_noop_without_corpus_contract(self) -> None:
        sample = {
            "intent": "跳转到另一个场景但没有提供目标路径",
            "asset_catalog": [],
            "commands": [{"id": "redirect", "type": "SCENE_REDIRECT", "parameters": {}}],
        }
        result = self.validator.validate(sample, "SCENE_REDIRECT", 1, self.assets)
        self.assertFalse(result["valid"])
        self.assertIn("redirect missing required parameter: url", result["errors"])

    def test_rejects_if_condition_branch_aliases_that_runtime_ignores(self) -> None:
        sample = {
            "intent": "累计答对次数后达到三次就进入下一关，否则保持当前关卡",
            "asset_catalog": [],
            "commands": [
                {"id": "increment", "type": "SET_VARIABLE", "parameters": {"key": "correctCount", "op": "add", "value": 1}},
                {"id": "gate", "type": "IF_CONDITION", "parameters": {
                    "condition": {"type": "variable", "variable": "correctCount", "operator": "gte", "value": 3},
                    "thenCommands": [{"id": "next", "type": "NEXT_LEVEL", "parameters": {}}],
                    "elseCommands": [],
                }},
            ],
        }
        result = self.validator.validate(sample, "IF_CONDITION", 1, self.assets)
        self.assertFalse(result["valid"])
        self.assertIn("gate trueCommands must be an array", result["errors"])
        self.assertIn("gate variable condition requires key", result["errors"])
        self.assertTrue(any("unsupported IF_CONDITION branch field" in item for item in result["errors"]))

    def test_accepts_runtime_if_condition_shape(self) -> None:
        sample = {
            "intent": "累计答对次数后达到三次就进入下一关，否则显示继续尝试提示",
            "asset_catalog": [],
            "commands": [
                {"id": "increment", "type": "SET_VARIABLE", "parameters": {"key": "correctCount", "op": "add", "value": 1}},
                {"id": "gate", "type": "IF_CONDITION", "parameters": {
                    "condition": {"type": "variable", "key": "correctCount", "operator": "gte", "value": 3},
                    "trueCommands": [{"id": "next", "type": "NEXT_LEVEL", "parameters": {}}],
                    "falseCommands": [{"id": "retry", "type": "SHOW_TEXT", "parameters": {"elementId": "tip", "text": "继续尝试"}}],
                }},
            ],
        }
        result = self.validator.validate(sample, "IF_CONDITION", 1, self.assets)
        self.assertTrue(result["valid"], result)

    def test_accepts_empty_runtime_if_condition_branch(self) -> None:
        sample = {
            "intent": "检查答对次数达到三次后进入下一关，否则暂不执行额外动作",
            "asset_catalog": [],
            "commands": [
                {"id": "gate", "type": "IF_CONDITION", "parameters": {
                    "condition": {"type": "variable", "key": "correctCount", "operator": "gte", "value": 3},
                    "trueCommands": [{"id": "next", "type": "NEXT_LEVEL", "parameters": {}}],
                    "falseCommands": [],
                }},
            ],
        }
        result = self.validator.validate(sample, "IF_CONDITION", 1, self.assets)
        self.assertTrue(result["valid"], result)


if __name__ == "__main__":
    unittest.main()
