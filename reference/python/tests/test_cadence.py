from __future__ import annotations

from agent_arc_status import (
    ArcSeed,
    CadenceConfig,
    CadenceController,
    SilenceWatchdog,
    validate,
)

FLOOR = 5 * 60_000
WINDOW = 20 * 60_000


class Clock:
    """Deterministic injectable clock in epoch ms."""

    def __init__(self, t: int = 0) -> None:
        self.t = t

    def __call__(self) -> int:
        return self.t

    def advance(self, ms: int) -> None:
        self.t += ms


def test_floor_gates_started_then_emits_retroactively() -> None:
    clk = Clock(0)
    ctrl = CadenceController(
        CadenceConfig(cadence_floor_ms=FLOOR, silence_window_ms=WINDOW, now=clk)
    )
    assert ctrl.begin(ArcSeed(arc_id="a", title="build")) is None
    clk.advance(FLOOR - 1_000)
    assert ctrl.tick() is None
    clk.advance(2_000)  # now past the floor
    event = ctrl.tick()
    assert event is not None
    assert event["phase"] == "started"
    assert validate(event).ok


def test_floor_zero_emits_started_immediately() -> None:
    clk = Clock(0)
    ctrl = CadenceController(CadenceConfig(cadence_floor_ms=0, now=clk))
    started = ctrl.begin(ArcSeed(arc_id="a", title="build"))
    assert started is not None
    assert started["phase"] == "started"


def test_heartbeat_only_after_silence_window() -> None:
    clk = Clock(0)
    ctrl = CadenceController(CadenceConfig(cadence_floor_ms=0, silence_window_ms=WINDOW, now=clk))
    started = ctrl.begin(ArcSeed(arc_id="a", title="build"))
    assert started is not None
    ctrl.on_emit(started)
    clk.advance(WINDOW - 1_000)
    assert ctrl.tick() is None
    clk.advance(2_000)
    hb = ctrl.tick("compiling shaders")
    assert hb is not None
    assert hb["phase"] == "heartbeat"
    assert hb["title"] == "compiling shaders"
    assert validate(hb).ok


def test_terminal_stops_emission() -> None:
    clk = Clock(0)
    ctrl = CadenceController(CadenceConfig(cadence_floor_ms=0, now=clk))
    ctrl.begin(ArcSeed(arc_id="a", title="build"))
    ctrl.on_emit(
        {"arc_id": "a", "phase": "done", "title": "done", "sent_at": "2026-06-14T09:00:00Z"}
    )
    assert ctrl.is_terminal()
    clk.advance(10 * WINDOW)
    assert ctrl.tick() is None


def test_watchdog_uses_local_receipt_time() -> None:
    clk = Clock(0)
    wd = SilenceWatchdog(CadenceConfig(silence_window_ms=WINDOW, now=clk))
    wd.record("a")  # receipt at t=0, ignoring any sent_at
    clk.advance(WINDOW + 100_000)
    stalled = wd.stalled()
    assert [s.arc_id for s in stalled] == ["a"]
    assert stalled[0].silent_ms == WINDOW + 100_000
    wd.forget("a")
    assert wd.stalled() == []
