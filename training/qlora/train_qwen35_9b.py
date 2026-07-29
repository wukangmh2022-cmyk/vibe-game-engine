#!/usr/bin/env python3
"""Single-GPU QLoRA preset for a Qwen 3.5 9B checkpoint.

Pass --model-name-or-path with the local checkpoint path or Hugging Face model
identifier. Any argument supplied after the preset overrides the defaults.
"""

from __future__ import annotations

import sys

from train_qlora import main


DEFAULT_ARGS = [
    "--data-dir", "training/qlora/data/level-authoring-dsl-v3",
    "--output-dir", "training/qlora/outputs/vibe-level-qwen35-9b-dsl-v3",
    "--max-length", "2048",
    "--epochs", "3",
    "--learning-rate", "1e-4",
    "--batch-size", "1",
    "--gradient-accumulation", "16",
    "--lora-r", "32",
    "--lora-alpha", "64",
    "--lora-dropout", "0.05",
    "--warmup-ratio", "0.03",
    "--eval-steps", "25",
    "--save-steps", "25",
]


if __name__ == "__main__":
    sys.argv[1:1] = DEFAULT_ARGS
    raise SystemExit(main())
