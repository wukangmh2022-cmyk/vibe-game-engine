from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from training.eval.editor_prompt import GUIDE_PATH, editor_system_prompt


class LevelPatchPromptV3Test(unittest.TestCase):
    def test_v3_is_the_versioned_editor_source(self) -> None:
        self.assertEqual(GUIDE_PATH.name, "levelPatchPromptV3.ts")
        source = GUIDE_PATH.read_text(encoding="utf-8")
        self.assertIn("export const LEVEL_PATCH_PROMPT_V3 = `", source)
        self.assertIn("levelPatchPromptV3", (ROOT / "level-editor/src/components/AIGenerateModal.tsx").read_text(encoding="utf-8"))

    def test_contract_matches_the_dsl_training_envelope(self) -> None:
        prompt = editor_system_prompt()
        self.assertIn("# VGE-DSL/1", prompt)
        self.assertIn("ASSETS 格式为 id | type | path", prompt)
        self.assertIn("只输出 DSL", prompt)
        self.assertIn("不输出 JSON、Markdown、解释或思考", prompt)
        self.assertIn("禁止 SCRIPT", prompt)

    def test_event_contract_matches_runtime_registration(self) -> None:
        prompt = editor_system_prompt()
        self.assertIn('AUTO "名称"', prompt)
        self.assertIn('ON signal "名称"', prompt)
        self.assertIn("SIGNAL/ON 同名", prompt)

    def test_loop_rule_allows_the_bounded_variable_pattern_used_by_training_data(self) -> None:
        prompt = editor_system_prompt()
        self.assertIn("循环必须更新条件或可达 BREAK", prompt)

    def test_skin_and_jump_contract_are_explicit(self) -> None:
        prompt = editor_system_prompt()
        self.assertIn("skin= selectedSkin=", prompt)
        self.assertIn("禁止 JUMP_ID", prompt)


if __name__ == "__main__":
    unittest.main()
