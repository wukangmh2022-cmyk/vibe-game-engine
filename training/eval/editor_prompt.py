"""Load the shared VGE-DSL/1 contract for evaluation and collection."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
GUIDE_PATH = ROOT / "level-editor" / "src" / "guides" / "levelPatchPromptV3.ts"
PREFIX = "export const LEVEL_PATCH_PROMPT_V3 = `"
SUFFIX = "`;\n\nexport default LEVEL_PATCH_PROMPT_V3;"


def editor_system_prompt() -> str:
    source = GUIDE_PATH.read_text(encoding="utf-8")
    start = source.find(PREFIX)
    end = source.rfind(SUFFIX)
    if start < 0 or end < start:
        raise RuntimeError(f"could not extract LEVEL_PATCH_PROMPT_V3 from {GUIDE_PATH}")
    prompt = source[start + len(PREFIX) : end]
    # The TypeScript template escapes a literal `${...}` so it is shown to the
    # model instead of being interpolated by JavaScript. Reproduce its runtime
    # value here; evaluation and the editor must send the same prompt bytes.
    return prompt.replace(r"\${", "${")
