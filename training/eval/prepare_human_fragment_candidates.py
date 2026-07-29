#!/usr/bin/env python3
"""Prepare compact numbered DSL fragment candidates from first-level export."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "training/eval/human_scene_first_level_dsl.md"
DEFAULT_OUTPUT_DIR = ROOT / "training/eval/generated_human_fragments/candidates-v1"


def extract_sections(markdown: str) -> list[dict[str, str]]:
    sections = []
    for part in re.split(r"\n(?=## \d+\. )", markdown):
        scene = re.search(r"- scene_file: `([^`]+)`", part)
        level = re.search(r"- level: `([^`]+)`", part)
        dsl = re.search(r"```vge-dsl\n(.*?)\n```", part, flags=re.S)
        if scene and dsl:
            sections.append({"scene_file": scene.group(1), "level": level.group(1) if level else "关卡1", "dsl": dsl.group(1)})
    return sections


def split_dsl_blocks(dsl: str) -> list[str]:
    lines = dsl.splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if not line.strip():
            if current:
                blocks.append(current)
                current = []
            continue
        is_top = line == line.lstrip()
        starts_new = is_top and (line.startswith(("ON ", "AUTO ", "EVENT ")) or (current and len(current) >= 8))
        if starts_new and current:
            blocks.append(current)
            current = []
        current.append(line)
        if is_top and line.startswith(("NEXT", "SCENE ", "BGM ", "BGM_STOP", "SE ", "WAIT ")) and len(current) >= 1:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)

    merged: list[str] = []
    buffer: list[str] = []
    for block in blocks:
        if len(block) <= 2 and buffer:
            buffer.extend(block)
        else:
            if buffer:
                merged.append("\n".join(buffer))
            buffer = list(block)
    if buffer:
        merged.append("\n".join(buffer))
    return [block for block in merged if block.strip()]


def compact_preview(dsl: str, max_lines: int = 8) -> str:
    lines = [line for line in dsl.splitlines() if line.strip()]
    preview = lines[:max_lines]
    if len(lines) > max_lines:
        preview.append("...")
    return " / ".join(line.strip() for line in preview)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    markdown = args.input.read_text(encoding="utf-8")
    candidates = []
    index = 1
    for section in extract_sections(markdown):
        for block_index, block in enumerate(split_dsl_blocks(section["dsl"]), start=1):
            candidates.append({
                "candidate_id": f"cand-{index:04d}",
                "source_scene_file": section["scene_file"],
                "source_level": section["level"],
                "block_index": block_index,
                "preview": compact_preview(block),
                "source_dsl": block,
            })
            index += 1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = args.output_dir / "candidates.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for item in candidates:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    md_lines = [
        "# Human DSL Fragment Candidates",
        "",
        "Pick candidate_id values from this list and write one deterministic planner TASK for each.",
        "",
    ]
    for item in candidates:
        md_lines.append(f"- {item['candidate_id']} | {item['source_scene_file']} | {item['preview']}")
    md_path = args.output_dir / "candidates.md"
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    manifest = {"input": str(args.input), "candidate_count": len(candidates), "jsonl": str(jsonl_path), "markdown": str(md_path)}
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
