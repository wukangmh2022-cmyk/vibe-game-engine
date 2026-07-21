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


if __name__ == "__main__":
    unittest.main()
