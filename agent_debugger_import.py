"""Import helpers for executable modules stored in the hyphenated agent-debugger directory."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType


def load_runtime_validator(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("vge_runtime_validator", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load runtime validator from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
