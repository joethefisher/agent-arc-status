"""Default human-line renderer. Rendering is a consumer concern (spec §1.3);
these helpers cover common cases in one call."""

from __future__ import annotations

import math
from typing import cast

from .types import ArcStatusEvent, ArcStatusPhase

_PHASE_SYMBOLS: dict[ArcStatusPhase, str] = {
    "started": "▶",
    "milestone": "✓",
    "heartbeat": "·",
    "done": "■",
    "blocked": "⛔",
}

_PHASE_LABELS: dict[ArcStatusPhase, str] = {
    "started": "STARTED",
    "milestone": "MILESTONE",
    "heartbeat": "HEARTBEAT",
    "done": "DONE",
    "blocked": "BLOCKED",
}


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def render(
    event: ArcStatusEvent,
    *,
    symbol: bool = True,
    phase_label: bool = False,
    step: bool = True,
    eta: bool = True,
    body: bool = False,
    body_max: int = 240,
) -> str:
    """Render an event to a single line, with an optional appended body block.

    Examples::

        "▶ build atlas index"
        "✓ [6/11] receiver booted (ETA 25m)"
        "■ v0.1 complete, 43 tests, deployed"
    """
    parts: list[str] = []

    if symbol:
        parts.append(_PHASE_SYMBOLS[event["phase"]])
    if phase_label:
        parts.append(_PHASE_LABELS[event["phase"]])

    step_v = event.get("step")
    total_v = event.get("total")
    if step and _is_int(step_v) and _is_int(total_v):
        parts.append(f"[{step_v}/{total_v}]")

    parts.append(event["title"])

    eta_v = event.get("eta_minutes")
    if eta and _is_number(eta_v):
        parts.append(f"(ETA {_format_minutes(cast(float, eta_v))})")

    line = " ".join(parts)

    body_v = event.get("body")
    if body and body_v:
        limit = max(1, body_max)
        rendered = body_v[: limit - 1] + "…" if len(body_v) > limit else body_v
        line += "\n" + rendered

    return line


def _format_minutes(minutes: float) -> str:
    if minutes < 1:
        return "<1m"
    # Round half-up to match JS Math.round (Python's round() is half-to-even),
    # then split into h/m so 119.6 -> "2h" rather than the malformed "1h60m".
    total = math.floor(minutes + 0.5)
    if total < 60:
        return f"{total}m"
    h = total // 60
    m = total - h * 60
    if m == 0:
        return f"{h}h"
    return f"{h}h{m}m"
