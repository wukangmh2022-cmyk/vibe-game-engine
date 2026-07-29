#!/usr/bin/env python3
"""Report command usage across source scenes or the generated SFT corpus.

Counts every command that can execute in a level: main command streams, event
streams, and nested branches/loops/choice handlers.  This mirrors the command
database traversal, so the report can guide future curriculum allocation.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterator

from curriculum_plan import PREFERRED_FAMILIES


ROOT = Path(__file__).resolve().parents[1]
SCENE_DIR = ROOT / "customer-demo" / "scene"
DEFAULT_OUTPUT = ROOT / "training-data" / "command-distribution"
DEFAULT_CORPUS = ROOT / "training-data" / "command-agent-sft" / "corpus.jsonl"
NESTED_FIELDS = ("commands", "trueCommands", "falseCommands", "onSelectedCommands", "onCancelSelectedCommands")


def iter_commands(commands: Any, context: str) -> Iterator[tuple[dict[str, Any], str]]:
    if not isinstance(commands, list):
        return
    for command in commands:
        if not isinstance(command, dict):
            continue
        yield command, context
        parameters = command.get("parameters")
        if not isinstance(parameters, dict):
            continue
        for field in NESTED_FIELDS:
            nested = parameters.get(field)
            if isinstance(nested, list):
                yield from iter_commands(nested, "nested")
        options = parameters.get("options")
        if isinstance(options, list):
            for option in options:
                if isinstance(option, dict) and isinstance(option.get("commands"), list):
                    yield from iter_commands(option["commands"], "nested")


def write_svg(path: Path, rows: list[dict[str, Any]], total: int, title: str, subtitle: str) -> None:
    # Keep labels readable for the long tail without relying on browser libraries.
    width, left, right, row_height = 1200, 190, 95, 27
    top, bottom = 60, 70
    height = top + bottom + len(rows) * row_height
    maximum = max((row["count"] for row in rows), default=1)
    plot_width = width - left - right
    bars: list[str] = []
    for index, row in enumerate(rows):
        y = top + index * row_height
        bar_width = round(plot_width * row["count"] / maximum, 2)
        label = html.escape(row["command_type"])
        bars.extend([
            f'<text x="{left - 14}" y="{y + 18}" text-anchor="end" class="label">{label}</text>',
            f'<rect x="{left}" y="{y + 4}" width="{bar_width}" height="17" rx="2" class="bar"/>',
            f'<text x="{left + bar_width + 8}" y="{y + 18}" class="value">{row["count"]} ({row["share_percent"]:.1f}%)</text>',
        ])
    markup = "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        f'<title id="title">{html.escape(title)}</title>',
        f'<desc id="desc">{html.escape(subtitle)}</desc>',
        '<style>.title{font:600 20px Arial,sans-serif;fill:#172033}.subtitle{font:13px Arial,sans-serif;fill:#5a6578}.label,.value{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#273142}.bar{fill:#147d92}.axis{stroke:#cbd5e1;stroke-width:1}</style>',
        f'<text x="{left}" y="26" class="title">{html.escape(title)}</text>',
        f'<text x="{left}" y="47" class="subtitle">{html.escape(subtitle)}</text>',
        f'<line x1="{left}" y1="{top - 8}" x2="{width - right}" y2="{top - 8}" class="axis"/>',
        *bars,
        '</svg>',
    ])
    path.write_text(markup + "\n", encoding="utf-8")


def count_source_scenes() -> tuple[Counter[str], Counter[str], dict[str, Counter[str]], dict[str, Any]]:
    total_by_type: Counter[str] = Counter()
    total_by_context: Counter[str] = Counter()
    scene_counts: dict[str, Counter[str]] = {}
    levels = 0
    for scene_name in PREFERRED_FAMILIES:
        scene_path = SCENE_DIR / f"{scene_name}.json"
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        counts: Counter[str] = Counter()
        for level in scene.get("levels", []):
            if not isinstance(level, dict):
                continue
            levels += 1
            for command, context in iter_commands(level.get("commands"), "main"):
                command_type = str(command.get("type") or "UNKNOWN").upper()
                counts[command_type] += 1
                total_by_type[command_type] += 1
                total_by_context[context] += 1
            for event in level.get("events", []):
                if not isinstance(event, dict):
                    continue
                for command, context in iter_commands(event.get("commands"), "event"):
                    command_type = str(command.get("type") or "UNKNOWN").upper()
                    counts[command_type] += 1
                    total_by_type[command_type] += 1
                    total_by_context[context] += 1
        scene_counts[scene_name] = counts
    return total_by_type, total_by_context, scene_counts, {
        "source": "15 source game scenes",
        "scene_count": len(PREFERRED_FAMILIES),
        "level_count": levels,
        "scenes": PREFERRED_FAMILIES,
        "counting_rule": "main, event, and nested branch/loop/choice commands are all counted once per occurrence",
    }


def count_corpus(corpus_path: Path, include_all: bool = False) -> tuple[Counter[str], Counter[str], dict[str, Counter[str]], dict[str, Any]]:
    total_by_type: Counter[str] = Counter()
    total_by_context: Counter[str] = Counter()
    batch_counts: dict[str, Counter[str]] = defaultdict(Counter)
    record_ids: set[str] = set()
    skipped_lines = 0
    for raw in corpus_path.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(raw)
        except json.JSONDecodeError:
            skipped_lines += 1
            continue
        plan_id = record.get("plan_id")
        if not include_all and (not isinstance(plan_id, str) or not plan_id.startswith("g")):
            continue
        output = record.get("output")
        commands = output.get("commands") if isinstance(output, dict) else None
        if not isinstance(commands, list):
            continue
        record_ids.add(str(record.get("sample_id") or plan_id or len(record_ids)))
        batch_id = str(record.get("source_dataset") or record.get("batch_id", "unknown"))
        for command, context in iter_commands(commands, "top_level"):
            command_type = str(command.get("type") or "UNKNOWN").upper()
            total_by_type[command_type] += 1
            total_by_context[context] += 1
            batch_counts[batch_id][command_type] += 1
        for event in output.get("extra_events", []) if isinstance(output, dict) else []:
            if not isinstance(event, dict):
                continue
            for command, context in iter_commands(event.get("commands"), "event"):
                command_type = str(command.get("type") or "UNKNOWN").upper()
                total_by_type[command_type] += 1
                total_by_context[context] += 1
                batch_counts[batch_id][command_type] += 1
    return total_by_type, total_by_context, dict(batch_counts), {
        "source": "level-authoring SFT corpus" if include_all else "phase-1 command-agent SFT corpus",
        "corpus_path": str(corpus_path),
        "accepted_samples": len(record_ids),
        "unique_plan_ids": len(record_ids),
        "skipped_malformed_lines": skipped_lines,
        "counting_rule": "top-level, event, and nested branch/loop/choice commands are all counted once per occurrence" + ("; all records are included" if include_all else "; only gxxxx planned records are included"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Count command distributions in source scenes or an SFT corpus")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--corpus", type=Path, help="Count accepted gxxxx samples in this JSONL corpus instead of source scenes")
    parser.add_argument("--include-all", action="store_true", help="Include every JSONL record and each output.extra_events command stream")
    args = parser.parse_args()

    if args.corpus:
        total_by_type, total_by_context, group_counts, scope = count_corpus(args.corpus, args.include_all)
        chart_title = "统一关卡创作 SFT 语料的指令出现频次" if args.include_all else "一期紧凑 SFT 语料的指令出现频次"
        chart_subtitle = f"最终已验收 {scope['accepted_samples']} 条；共 {{total}} 次，包含顶层、事件与嵌套指令" if args.include_all else f"最终已验收 {scope['accepted_samples']} 条；共 {{total}} 次，包含顶层与嵌套指令"
        prefix = "level-authoring-command-frequency" if args.include_all else "sft-command-frequency"
        group_label = "by_batch"
    else:
        total_by_type, total_by_context, group_counts, scope = count_source_scenes()
        chart_title = "15 个源关卡的指令出现频次"
        chart_subtitle = "共 {total} 次，包含主线、事件与嵌套分支/循环/选项指令"
        prefix = "command-frequency"
        group_label = "by_scene"

    total = sum(total_by_type.values())
    rows = [
        {
            "rank": index,
            "command_type": command_type,
            "count": count,
            "share_percent": round(count * 100 / total, 3) if total else 0,
            "groups_using": sum(1 for counts in group_counts.values() if counts[command_type]),
            "group_coverage_percent": round(sum(1 for counts in group_counts.values() if counts[command_type]) * 100 / len(group_counts), 3) if group_counts else 0,
        }
        for index, (command_type, count) in enumerate(total_by_type.most_common(), 1)
    ]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / f"{prefix}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=list(rows[0]) if rows else ["rank", "command_type", "count", "share_percent", "groups_using", "group_coverage_percent"],
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)
    report = {
        "scope": scope,
        "total_command_occurrences": total,
        "command_type_count": len(rows),
        "by_execution_context": dict(sorted(total_by_context.items())),
        "distribution": rows,
        group_label: {name: dict(sorted(counts.items())) for name, counts in group_counts.items()},
    }
    json_path = args.output_dir / f"{prefix}.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    svg_path = args.output_dir / f"{prefix}.svg"
    write_svg(svg_path, rows, total, chart_title, chart_subtitle.format(total=total))
    print(json.dumps({"json": str(json_path), "csv": str(csv_path), "chart": str(svg_path), "total": total, "command_types": len(rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
