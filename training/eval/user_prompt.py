"""Canonical user-message format shared by training and evaluation."""

from __future__ import annotations

from typing import Any


def render_level_dsl_user_prompt(
    intent: str,
    assets: list[dict[str, Any]],
    canvas_width: int = 800,
    canvas_height: int = 600,
) -> str:
    catalog = "\n".join(
        " | ".join(str(asset.get(key, "")) for key in ("id", "type", "path"))
        for asset in assets
    ) or "(none)"
    return (
        f"TASK\n{intent}\n"
        f"CANVAS {canvas_width} {canvas_height}\n"
        f"ASSETS id | type | path\n{catalog}"
    )
