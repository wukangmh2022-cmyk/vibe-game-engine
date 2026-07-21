#!/usr/bin/env python3
"""Query command examples and local command context without loading scene files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from command_db import CommandDatabase

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Query the Vibe command example database")
    parser.add_argument("--database", default=str(ROOT / "agent-debugger" / "state" / "command-index.sqlite"))
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("stats")
    find = subparsers.add_parser("find")
    find.add_argument("--type", default="")
    find.add_argument("--query", default="")
    find.add_argument("--limit", type=int, default=5)
    context = subparsers.add_parser("context")
    context.add_argument("command_key")
    context.add_argument("--before", type=int, default=5)
    context.add_argument("--after", type=int, default=5)
    level = subparsers.add_parser("level")
    level.add_argument("level_key")
    args = parser.parse_args()

    database = CommandDatabase(Path(args.database))
    if args.command == "stats":
        result = database.stats()
    elif args.command == "find":
        result = database.find_commands(args.type, args.query, args.limit)
    elif args.command == "context":
        result = database.command_context(args.command_key, args.before, args.after)
    else:
        result = database.level_metadata(args.level_key)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
