#!/usr/bin/env python3
"""Download a Hugging Face model through a selectable mirror."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote


def download_huggingface(model_id: str, output_dir: Path, revision: str, endpoint: str | None) -> None:
    if endpoint:
        os.environ["HF_ENDPOINT"] = endpoint
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=model_id,
        local_dir=str(output_dir),
        revision=revision,
        max_workers=8,
    )


def repair_modelscope_config(output_dir: Path) -> None:
    """Undo ModelScope's legacy Qwen3.5 config alias when it creates a backup."""
    current = output_dir / "config.json"
    backup = output_dir / "config.json.bak"
    if not (current.is_file() and backup.is_file()):
        return
    try:
        current_data = json.loads(current.read_text(encoding="utf-8"))
        backup_data = json.loads(backup.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return
    if current_data.get("model_type") == "qwen2_vl" and backup_data.get("model_type") == "qwen3_5":
        shutil.copy2(backup, current)
        print("Restored Qwen3.5 config.json from ModelScope backup.", flush=True)


def download_modelscope(model_id: str, output_dir: Path, revision: str) -> None:
    from modelscope import snapshot_download

    snapshot_download(model_id, local_dir=str(output_dir), revision=revision)
    repair_modelscope_config(output_dir)


def download_modelscope_raw(model_id: str, output_dir: Path, revision: str) -> None:
    """Download a ModelScope repository without its Python package.

    `curl -C -` keeps partial multi-gigabyte shards and continues them after a
    temporary network failure. It also avoids ModelScope's legacy config alias
    rewrite for Qwen3.5 checkpoints.
    """
    modelscope_revision = "master" if revision == "main" else revision
    manifest_url = (
        "https://www.modelscope.cn/api/v1/models/"
        f"{model_id}/repo/files?Revision={quote(modelscope_revision, safe='')}&Recursive=true"
    )
    manifest = subprocess.check_output(
        ["curl", "-fsSL", "--retry", "5", "--retry-delay", "2", manifest_url],
        text=True,
    )
    payload = json.loads(manifest)
    files = payload.get("Data", {}).get("Files", [])
    if not isinstance(files, list) or not files:
        raise RuntimeError(f"ModelScope returned no files for {model_id}")

    for entry in files:
        path = entry.get("Path")
        size = entry.get("Size")
        if not isinstance(path, str) or not isinstance(size, int):
            continue
        destination = (output_dir / path).resolve()
        if not destination.is_relative_to(output_dir.resolve()):
            raise ValueError(f"unsafe ModelScope path: {path}")
        if destination.is_file() and destination.stat().st_size == size:
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        source_url = (
            "https://www.modelscope.cn/models/"
            f"{model_id}/resolve/{quote(modelscope_revision, safe='')}/{quote(path, safe='/')}"
        )
        print(f"Downloading {path} ...", flush=True)
        subprocess.run(
            [
                "curl", "-fL", "--retry", "5", "--retry-delay", "2",
                "--continue-at", "-", "--output", str(destination), source_url,
            ],
            check=True,
        )


def is_complete(output_dir: Path) -> bool:
    return (output_dir / "config.json").is_file() and any(output_dir.glob("*.safetensors"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-id", default="Qwen/Qwen3.6-27B")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--revision", default="main")
    parser.add_argument(
        "--source",
        choices=["auto", "hf-mirror", "huggingface", "modelscope", "modelscope-raw"],
        default="auto",
        help="auto tries the Hugging Face mirror first, then direct Alibaba ModelScope.",
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if is_complete(args.output_dir):
        print(f"Model already exists: {args.output_dir}")
        return 0

    sources = [args.source] if args.source != "auto" else ["hf-mirror", "modelscope-raw"]
    errors: list[str] = []
    for source in sources:
        try:
            print(f"Downloading {args.model_id} via {source} to {args.output_dir} ...", flush=True)
            if source == "hf-mirror":
                download_huggingface(args.model_id, args.output_dir, args.revision, "https://hf-mirror.com")
            elif source == "huggingface":
                download_huggingface(args.model_id, args.output_dir, args.revision, None)
            elif source == "modelscope-raw":
                download_modelscope_raw(args.model_id, args.output_dir, args.revision)
            else:
                download_modelscope(args.model_id, args.output_dir, args.revision)
            if is_complete(args.output_dir):
                print(f"Model download complete: {args.output_dir}")
                return 0
            errors.append(f"{source}: download returned without config.json and safetensors")
        except Exception as error:
            errors.append(f"{source}: {error}")
            print(errors[-1], file=sys.stderr, flush=True)
    raise SystemExit("Model download failed. " + " | ".join(errors))


if __name__ == "__main__":
    raise SystemExit(main())
