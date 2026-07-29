#!/usr/bin/env python3
"""Serve Qwen3.5-9B-VL + LoRA using vLLM with OpenAI-compatible API."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def check_vllm_installed() -> None:
    """Check if vLLM is installed."""
    try:
        import vllm  # noqa: F401
    except ImportError:
        print("❌ vLLM is not installed. Installing...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "vllm"
        ])
        print("✅ vLLM installed successfully.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path("/root/autodl-tmp/models/Qwen3.5-9B"),
        help="Path to the base model directory"
    )
    parser.add_argument(
        "--adapter-dir",
        type=Path,
        default=Path("/root/adapters/vibe-level-qwen35-9b"),
        help="Path to the LoRA adapter directory"
    )
    parser.add_argument(
        "--served-model-name",
        default="vibe-level-qwen35-9b",
        help="Name of the model in the API"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind the server to"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=6006,
        help="Port to bind the server to"
    )
    parser.add_argument(
        "--max-model-len",
        type=int,
        default=8192,
        help="Maximum sequence length for the model"
    )
    parser.add_argument(
        "--gpu-memory-utilization",
        type=float,
        default=0.85,
        help="GPU memory utilization ratio (0.0-1.0)"
    )
    parser.add_argument(
        "--tensor-parallel-size",
        type=int,
        default=1,
        help="Number of GPUs to use for tensor parallelism"
    )
    parser.add_argument(
        "--max-num-seqs",
        type=int,
        default=16,
        help="Maximum number of sequences to process in parallel"
    )
    args = parser.parse_args()

    # Check if model exists
    if not (args.model_dir / "config.json").is_file():
        print(f"❌ Model not found at {args.model_dir}")
        return 1

    # Check if adapter exists
    if not (args.adapter_dir / "adapter_config.json").is_file():
        print(f"❌ Adapter not found at {args.adapter_dir}")
        return 1

    # Check vLLM installation
    check_vllm_installed()

    # Build vLLM command

    cmd = [
        sys.executable, "-m", "vllm.entrypoints.openai.api_server",
        "--model", str(args.model_dir),
        "--served-model-name", args.served_model_name,
        "--host", args.host,
        "--port", str(args.port),
        "--max-model-len", str(args.max_model_len),
        "--gpu-memory-utilization", str(args.gpu_memory_utilization),
        "--tensor-parallel-size", str(args.tensor_parallel_size),
        "--max-num-seqs", str(args.max_num_seqs),
        "--enable-lora",
        "--lora-modules", f"{args.served_model_name}={args.adapter_dir}",
        "--dtype", "bfloat16",
        "--enable-log-requests",   # 👈 加上这一行
    ]

    # Add dtype for VL model compatibility
    cmd.extend(["--dtype", "bfloat16"])

    print("🚀 Starting vLLM server with the following configuration:")
    print(f"   Base Model: {args.model_dir}")
    print(f"   LoRA Adapter: {args.adapter_dir}")
    print(f"   Model Name: {args.served_model_name}")
    print(f"   Host: {args.host}:{args.port}")
    print(f"   GPU Memory Utilization: {args.gpu_memory_utilization}")
    print(f"   Max Sequences: {args.max_num_seqs}")
    print(f"   Max Model Length: {args.max_model_len}")
    print()
    print("📡 API endpoints:")
    print(f"   Health: http://{args.host}:{args.port}/health")
    print(f"   Models: http://{args.host}:{args.port}/v1/models")
    print(f"   Chat: http://{args.host}:{args.port}/v1/chat/completions")
    print()
    print("=" * 60)
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    print()

    # Run vLLM server
    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"❌ vLLM server failed with error: {e}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())