#!/usr/bin/env python3
"""Build the local command example database used by teacher-model tools."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from command_db import build_command_database

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Index Vibe scene commands into SQLite")
    parser.add_argument("--project", default=str(ROOT / "customer-demo"))
    parser.add_argument("--output", default=str(ROOT / "agent-debugger" / "state" / "command-index.sqlite"))
    args = parser.parse_args()
    result = build_command_database(Path(args.project), Path(args.output))
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
