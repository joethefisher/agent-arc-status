from __future__ import annotations

from typing import Any, cast

from agent_arc_status import ArcStatusEvent, render


def ev(**kw: Any) -> ArcStatusEvent:
    return cast(ArcStatusEvent, {"arc_id": "a", "sent_at": "2026-06-14T09:00:00Z", **kw})


def test_phase_symbols() -> None:
    assert render(ev(phase="started", title="build")) == "▶ build"
    assert render(ev(phase="milestone", title="m")).startswith("✓ ")
    assert render(ev(phase="heartbeat", title="h")).startswith("· ")
    assert render(ev(phase="done", title="d")).startswith("■ ")
    assert render(ev(phase="blocked", title="b")).startswith("⛔ ")


def test_step_total_only_when_both_present() -> None:
    assert render(ev(phase="milestone", title="m", step=6, total=11)) == "✓ [6/11] m"
    assert render(ev(phase="milestone", title="m", step=6)) == "✓ m"


def test_eta_boundaries() -> None:
    assert render(ev(phase="milestone", title="m", eta_minutes=25)) == "✓ m (ETA 25m)"
    assert render(ev(phase="milestone", title="m", eta_minutes=95)) == "✓ m (ETA 1h35m)"
    assert render(ev(phase="milestone", title="m", eta_minutes=120)) == "✓ m (ETA 2h)"
    assert render(ev(phase="milestone", title="m", eta_minutes=119.6)) == "✓ m (ETA 2h)"
    assert render(ev(phase="milestone", title="m", eta_minutes=59.6)) == "✓ m (ETA 1h)"
    assert render(ev(phase="milestone", title="m", eta_minutes=0.4)) == "✓ m (ETA <1m)"


def test_symbol_and_phase_label_toggles() -> None:
    assert render(ev(phase="done", title="d"), symbol=False) == "d"
    assert render(ev(phase="done", title="d"), phase_label=True) == "■ DONE d"


def test_body_truncation_and_clamp() -> None:
    out = render(ev(phase="milestone", title="m", body="x" * 300), body=True, body_max=20)
    body_line = out.split("\n")[1]
    assert len(body_line) == 20
    assert body_line.endswith("…")

    # body_max clamps to >= 1: a longer body becomes just the ellipsis
    clamped = render(ev(phase="milestone", title="m", body="abc"), body=True, body_max=0)
    assert clamped.split("\n")[1] == "…"

    # body omitted by default
    assert "\n" not in render(ev(phase="milestone", title="m", body="hello"))
