"""Local, non-exporting evaluation endpoint configuration."""

from __future__ import annotations

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = ROOT / "agent-debugger" / ".env"
PROFILE_PREFIXES = {
    "qwen36_27b": "VIBE_EVAL_QWEN36_27B",
    "qwen35_9b": "VIBE_EVAL_QWEN35_9B",
    "adapter": "VIBE_EVAL_ADAPTER",
    "judge": "VIBE_EVAL_JUDGE",
}


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            values[key] = value.strip().strip('"').strip("'")
    return values


def load_settings(path: Path) -> dict[str, str]:
    """Load dotenv values without mutating process environment; shell wins."""
    values = read_env_file(path)
    values.update({key: value for key, value in os.environ.items() if key.startswith("VIBE_EVAL_")})
    return values


def endpoint_from_profile(profile: str, values: dict[str, str]) -> dict[str, str]:
    prefix = PROFILE_PREFIXES.get(profile)
    if not prefix:
        raise ValueError(f"unknown evaluation profile: {profile}; choose from {', '.join(PROFILE_PREFIXES)}")
    base = values.get(f"{prefix}_API_BASE", "").strip().rstrip("/")
    key = values.get(f"{prefix}_API_KEY", "").strip()
    model = values.get(f"{prefix}_MODEL", "").strip()
    missing = [name for name, value in (("API_BASE", base), ("API_KEY", key), ("MODEL", model)) if not value]
    if missing:
        raise ValueError(f"evaluation profile {profile} is incomplete in the env file: missing {', '.join(missing)}")
    return {"name": profile, "model": model, "api_base": base, "api_key": key}
