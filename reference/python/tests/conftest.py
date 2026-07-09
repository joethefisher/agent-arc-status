from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest

from agent_arc_status import ArcStatusEvent

EXAMPLES_DIR = Path(__file__).resolve().parents[3] / "examples"


def _load(name: str) -> list[ArcStatusEvent]:
    out: list[ArcStatusEvent] = []
    for line in (EXAMPLES_DIR / name).read_text().splitlines():
        stripped = line.strip()
        if stripped:
            out.append(cast(ArcStatusEvent, json.loads(stripped)))
    return out


@pytest.fixture
def examples() -> Callable[[str], list[ArcStatusEvent]]:
    """Return a loader that parses a canonical example stream by filename."""
    return _load
