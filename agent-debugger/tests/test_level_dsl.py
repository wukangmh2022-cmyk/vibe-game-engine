from __future__ import annotations

import json
import unittest
from pathlib import Path

from training.dsl.level_dsl import DslError, compile_patch, normalize_for_comparison, parse_program, serialize_patch
from training.qlora.validate_dsl_corpus import audit_row


ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "training-data" / "level-authoring-sft-v4-runtime-passed.jsonl"


class LevelDslTest(unittest.TestCase):
    def test_label_resolves_to_following_generated_command_id(self) -> None:
        program = parse_program("""VAR count = 0
LABEL retry
VAR count + 1
IF count < 3
    JUMP retry
""")
        target = program["commands"][1]["id"]
        jump = program["commands"][2]["parameters"]["trueCommands"][0]
        self.assertEqual(jump["parameters"]["target"], target)

    def test_labels_support_forward_and_cross_event_jumps(self) -> None:
        program = parse_program("""JUMP finish
ON done "完成事件"
    JUMP finish
LABEL finish
TEXT result "完成"
""")
        target = program["commands"][1]["id"]
        self.assertEqual(program["commands"][0]["parameters"]["target"], target)
        self.assertEqual(program["extra_events"][0]["commands"][0]["parameters"]["target"], target)

    def test_label_must_bind_one_real_command_at_same_indent(self) -> None:
        with self.assertRaisesRegex(DslError, "same indentation"):
            parse_program("LABEL retry\n    WAIT 1\n")
        with self.assertRaisesRegex(DslError, "duplicate or consecutive LABEL"):
            parse_program("LABEL first\nLABEL second\nWAIT 1\n")
        with self.assertRaisesRegex(DslError, "target does not exist"):
            parse_program("JUMP missing\n")

    def test_compile_injects_request_context(self) -> None:
        patch = compile_patch('TEXT title "你好世界"\n', intent="显示标题", asset_catalog=[])
        self.assertEqual(patch["intent"], "显示标题")
        self.assertEqual(patch["asset_catalog"], [])
        self.assertEqual(patch["commands"][0]["type"], "SHOW_TEXT")

    def test_quoted_unicode_resource_id_is_equivalent_to_bare_id(self) -> None:
        quoted = parse_program('SE "掌声" vol=0.8\n')
        bare = parse_program("SE 掌声 vol=0.8\n")
        self.assertEqual(
            quoted["commands"][0]["parameters"],
            bare["commands"][0]["parameters"],
        )

    def test_rejects_bad_indentation_and_unsafe_generic_command(self) -> None:
        with self.assertRaises(DslError):
            parse_program("TEXT a x\n  WAIT 1\n")
        with self.assertRaises(DslError):
            parse_program('CMD SCRIPT code="danger"\n')

    def test_guidance_does_not_advertise_unsupported_transform_commands(self) -> None:
        guidance = (ROOT / "level-editor/src/guides/levelPatchPromptV3.ts").read_text(encoding="utf-8")
        self.assertNotIn("SCALE element", guidance)
        self.assertNotIn("ROTATE element", guidance)
        self.assertIn('STYLE element {"display":"none","scale":1.2,"alpha":1}', guidance)
        with self.assertRaisesRegex(DslError, "unknown command SCALE"):
            parse_program("SCALE item 1.2 1.2\n")
        with self.assertRaisesRegex(DslError, "unknown command ROTATE"):
            parse_program("ROTATE item 45\n")

    def test_button_and_click_lower_to_one_runtime_choice(self) -> None:
        program = parse_program('''BUTTON exit_continue "继续" x=350 y=360
CLICK exit_continue enabled=true block=false
    NEXT
''')
        self.assertEqual(len(program["commands"]), 1)
        button = program["commands"][0]
        self.assertEqual(button["type"], "SHOW_CHOICES")
        self.assertEqual(button["parameters"]["position"], {"x": 350, "y": 360})
        self.assertFalse(button["parameters"]["blocking"])
        self.assertEqual(button["parameters"]["options"][0]["id"], "exit_continue")
        self.assertEqual(button["parameters"]["options"][0]["text"], "继续")
        self.assertEqual(button["parameters"]["options"][0]["commands"][0]["type"], "NEXT_LEVEL")
        serialized = serialize_patch({"commands": program["commands"], "extra_events": []})
        self.assertIn('BUTTON exit_continue "继续" x=350 y=360', serialized)
        self.assertIn("CLICK exit_continue enabled=true block=false", serialized)
        self.assertNotIn("CHOICES exit_continue", serialized)
        self.assertEqual(
            normalize_for_comparison(program),
            normalize_for_comparison(parse_program(serialized)),
        )

    def test_audio_resource_directory_matches_command_role(self) -> None:
        def row(dsl: str, path: str) -> dict:
            return {
                "source_id": "audio-role-test",
                "intent": "测试音频资源语义",
                "dsl": dsl,
                "output": parse_program(dsl),
                "asset_catalog": [{"id": "audio_asset", "type": "audio", "path": path}],
            }

        self.assertEqual(audit_row(row("BGM audio_asset\n", "audio/bgm/theme.mp3"))[0], [])
        self.assertEqual(audit_row(row("SE audio_asset\n", "audio/se/click.mp3"))[0], [])
        self.assertTrue(
            any("outside bgm directory" in error for error in audit_row(row("BGM audio_asset\n", "audio/se/click.mp3"))[0])
        )
        self.assertTrue(
            any("outside se directory" in error for error in audit_row(row("SE audio_asset\n", "audio/bgm/theme.mp3"))[0])
        )

    def test_rejects_immediate_text_overwrite_in_same_scope(self) -> None:
        dsl = 'TEXT status "准备中"\nTEXT_SET status "完成"\n'
        row = {
            "source_id": "text-overwrite-test",
            "intent": "先显示准备中，再显示完成",
            "dsl": dsl,
            "output": parse_program(dsl),
            "asset_catalog": [],
        }
        self.assertTrue(any("immediately overwritten" in error for error in audit_row(row)[0]))
        row["dsl"] = 'TEXT status "准备中"\nWAIT 800\nTEXT_SET status "完成"\n'
        row["output"] = parse_program(row["dsl"])
        self.assertFalse(any("immediately overwritten" in error for error in audit_row(row)[0]))

    def test_v4_round_trip_and_compression(self) -> None:
        source_chars = 0
        dsl_chars = 0
        count = 0
        for line in CORPUS.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            patch = row["output"]
            dsl = serialize_patch(patch)
            rebuilt = parse_program(dsl)
            self.assertEqual(normalize_for_comparison(patch), normalize_for_comparison(rebuilt), row.get("sample_id"))
            source_chars += len(json.dumps(patch, ensure_ascii=False, separators=(",", ":")))
            dsl_chars += len(dsl)
            count += 1
        self.assertEqual(count, 1334)
        self.assertGreater(1 - dsl_chars / source_chars, 0.70)


if __name__ == "__main__":
    unittest.main()
