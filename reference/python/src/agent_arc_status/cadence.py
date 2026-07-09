"""Cadence discipline as executable code.

``CadenceController`` drives one arc's emission discipline (gate sub-floor arcs,
emit a possibly-retroactive ``started`` at the floor, fire a ``heartbeat`` when
the silence window would elapse). ``SilenceWatchdog`` detects stalls across many
arcs using LOCAL receipt time, never the event's ``sent_at`` (§7.5). Both take an
injectable ``now()`` (epoch ms) and are meant to be driven by a timer INDEPENDENT
of the work loop (§5.2). Zero dependencies.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Callable
from dataclasses import dataclass, field

from .types import ArcStatusEvent, ArcStatusPhase

_DEFAULT_FLOOR_MS = 5 * 60_000
_DEFAULT_WINDOW_MS = 20 * 60_000


def _default_now_ms() -> int:
    return int(_dt.datetime.now(_dt.timezone.utc).timestamp() * 1000)


def _iso_z(ms: int) -> str:
    """RFC 3339 timestamp with millisecond precision and a ``Z``, matching the
    TS ``new Date(ms).toISOString()``."""
    secs, millis = divmod(ms, 1000)
    stamp = _dt.datetime.fromtimestamp(secs, _dt.timezone.utc)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S") + f".{millis:03d}Z"


@dataclass(frozen=True, slots=True)
class CadenceConfig:
    #: Minimum arc age before any event is emitted. Default 5 min (§5.1).
    cadence_floor_ms: int = _DEFAULT_FLOOR_MS
    #: Max silence before a heartbeat is required. Default 20 min (§5.2).
    silence_window_ms: int = _DEFAULT_WINDOW_MS
    #: Injectable clock in ms epoch.
    now: Callable[[], int] = field(default=_default_now_ms)


@dataclass(frozen=True, slots=True)
class ArcSeed:
    arc_id: str
    title: str
    arc_kind: str | None = None
    protocol_version: str | None = None


@dataclass(frozen=True, slots=True)
class StalledArc:
    arc_id: str
    last_receipt_ms: int
    silent_ms: int


class CadenceController:
    """Per-arc emission controller. Owns ``started`` and ``heartbeat``; the caller
    emits ``milestone``/``blocked``/``done`` and reports them via
    :meth:`on_emit` so the silence timer resets."""

    def __init__(self, config: CadenceConfig | None = None) -> None:
        cfg = config or CadenceConfig()
        self._floor_ms = cfg.cadence_floor_ms
        self._window_ms = cfg.silence_window_ms
        self._now = cfg.now
        self._seed: ArcSeed | None = None
        self._began_at = 0
        self._started_emitted = False
        self._terminal = False
        self._last_emit_at = 0

    def begin(self, seed: ArcSeed) -> ArcStatusEvent | None:
        """Register the start of an arc. The floor is a DELAY threshold, not a
        prediction (§5.1): nothing is emitted until the arc has lived the floor,
        so a short-looking arc that runs long still becomes visible. Returns a
        ``started`` immediately only when the floor is 0."""
        self._seed = seed
        self._began_at = self._now()
        self._started_emitted = False
        self._terminal = False
        self._last_emit_at = 0
        return self._maybe_emit_started()

    def on_emit(self, event: ArcStatusEvent) -> None:
        """Report a caller-emitted event so the silence timer resets. ``done``
        marks the arc terminal."""
        self._last_emit_at = self._now()
        if event["phase"] == "started":
            self._started_emitted = True
        if event["phase"] == "done":
            self._terminal = True

    def tick(self, current_activity: str = "still working") -> ArcStatusEvent | None:
        """Drive the cadence on a timer independent of the work loop. Returns the
        (possibly retroactive) ``started`` once the floor is crossed, then a
        ``heartbeat`` once the silence window elapses with no emit, else None."""
        if self._terminal or self._seed is None:
            return None
        if not self._started_emitted:
            return self._maybe_emit_started()
        if self._now() - self._last_emit_at >= self._window_ms:
            return self._emit("heartbeat", current_activity)
        return None

    def is_terminal(self) -> bool:
        return self._terminal

    def _maybe_emit_started(self) -> ArcStatusEvent | None:
        seed = self._seed
        if self._started_emitted or self._terminal or seed is None:
            return None
        if self._now() - self._began_at < self._floor_ms:
            return None
        self._started_emitted = True
        return self._emit("started", seed.title)

    def _emit(self, phase: ArcStatusPhase, title: str) -> ArcStatusEvent:
        seed = self._seed
        assert seed is not None  # _emit is only called when seeded
        t = self._now()
        self._last_emit_at = t
        event: ArcStatusEvent = {
            "arc_id": seed.arc_id,
            "phase": phase,
            "title": title,
            "sent_at": _iso_z(t),
        }
        if seed.arc_kind:
            event["arc_kind"] = seed.arc_kind
        if seed.protocol_version:
            event["protocol_version"] = seed.protocol_version
        return event


class SilenceWatchdog:
    """Multi-arc stall detector for a consumer/sidecar. Tracks the LOCAL receipt
    time of each arc's most recent event and reports arcs quiet past the silence
    window, including those whose own heartbeat is missing."""

    def __init__(self, config: CadenceConfig | None = None) -> None:
        cfg = config or CadenceConfig()
        self._window_ms = cfg.silence_window_ms
        self._now = cfg.now
        self._last_receipt: dict[str, int] = {}

    def record(self, arc_id: str, receipt_ms: int | None = None) -> None:
        """Record receipt of an event for an arc, using LOCAL receipt time — never
        the event's ``sent_at`` (§7.5), so a skewed or delayed sender cannot look
        alive."""
        self._last_receipt[arc_id] = self._now() if receipt_ms is None else receipt_ms

    def stalled(self, now_ms: int | None = None) -> list[StalledArc]:
        """Arcs whose last receipt is older than the silence window."""
        now = self._now() if now_ms is None else now_ms
        out: list[StalledArc] = []
        for arc_id, last in self._last_receipt.items():
            silent = now - last
            if silent >= self._window_ms:
                out.append(StalledArc(arc_id=arc_id, last_receipt_ms=last, silent_ms=silent))
        return out

    def forget(self, arc_id: str) -> None:
        """Stop tracking an arc (e.g. after a terminal event)."""
        self._last_receipt.pop(arc_id, None)
