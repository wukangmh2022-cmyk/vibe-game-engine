"""Cheap dataset checks that run before model or CUDA initialization."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def prompt_sha256(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def validate_dsl_dataset(data_dir: str | Path, *, require_quality_reports: bool = True) -> None:
    directory = Path(data_dir)
    manifest_path = directory / "manifest.json"
    if not manifest_path.is_file():
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "vge-dsl-sft-v1":
        return

    from training.eval.editor_prompt import editor_system_prompt

    expected_prompt = editor_system_prompt()
    expected_hash = prompt_sha256(expected_prompt)
    if manifest.get("system_prompt_sha256") != expected_hash:
        raise ValueError(
            "DSL dataset Guidance is stale; rerun training/qlora/prepare_dsl_data.py "
            f"before training (expected {expected_hash}, found {manifest.get('system_prompt_sha256')!r})"
        )

    if require_quality_reports:
        quality_path = directory / "quality-report.json"
        if not quality_path.is_file():
            raise ValueError(f"missing DSL quality gate report: {quality_path}")
        quality = json.loads(quality_path.read_text(encoding="utf-8"))
        if quality.get("static_valid") is not True or quality.get("runtime_valid") is not True:
            raise ValueError("DSL corpus has not passed both static and real-JS runtime gates")
        if int(quality.get("converted_rows", -1)) != int(manifest.get("source_groups", -2)):
            raise ValueError("DSL quality report row count does not match manifest")

        tokenizer_path = directory / "tokenizer-report.json"
        if not tokenizer_path.is_file():
            raise ValueError(f"missing tokenizer preflight report: {tokenizer_path}")
        tokenizer_report = json.loads(tokenizer_path.read_text(encoding="utf-8"))
        if tokenizer_report.get("enable_thinking") is not False or tokenizer_report.get("over_limit"):
            raise ValueError("tokenizer preflight either enabled thinking or found truncated rows")
        if int(tokenizer_report.get("rows", -1)) != int(manifest.get("source_groups", -2)):
            raise ValueError("tokenizer report row count does not match manifest")

    for filename in ("train.jsonl", "validation.jsonl"):
        path = directory / filename
        if not path.is_file():
            raise ValueError(f"missing DSL dataset split: {path}")
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            messages = row.get("messages") or []
            if len(messages) != 3 or [message.get("role") for message in messages] != ["system", "user", "assistant"]:
                raise ValueError(f"{path}:{line_number} must contain system/user/assistant messages")
            if messages[0].get("content") != expected_prompt:
                raise ValueError(f"{path}:{line_number} does not contain the canonical V3 Guidance")
