"""Fold an ordered event stream into current arc state. Pure, zero deps."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .types import ArcStatusEvent, ArcStatusPhase


@dataclass(frozen=True, slots=True)
class ArcMilestone:
    title: str
    sent_at: str
    step: int | None = None
    total: int | None = None


@dataclass(frozen=True, slots=True)
class ArcBlocker:
    title: str
    sent_at: str
    body: str | None = None


@dataclass(frozen=True, slots=True)
class ArcState:
    arc_id: str
    #: Objective, from the ``started`` event (falls back to the first event).
    title: str
    #: Phase of the most recent event.
    phase: ArcStatusPhase
    #: Derived lifecycle status; ``blocked`` clears once a later non-blocked event arrives.
    status: Literal["active", "blocked", "done"]
    started_at: str
    last_event_at: str
    event_count: int
    milestones: list[ArcMilestone]
    #: The current blocker if the most recent event is ``blocked``, else ``None``.
    blocked: ArcBlocker | None
    step: int | None = None
    total: int | None = None
    eta_minutes: float | None = None


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def reduce_arc(events: list[ArcStatusEvent]) -> ArcState | None:
    """Reduce an ordered sequence for one arc into current state, or ``None`` for
    an empty sequence. Does not validate; pass a sequence you trust."""
    if not events:
        return None

    first = events[0]
    last = events[-1]
    started = next((e for e in events if e["phase"] == "started"), None)

    milestones: list[ArcMilestone] = []
    step: int | None = None
    total: int | None = None
    eta_minutes: float | None = None

    for e in events:
        if e["phase"] == "milestone":
            milestones.append(
                ArcMilestone(
                    title=e["title"], sent_at=e["sent_at"], step=e.get("step"), total=e.get("total")
                )
            )
        s = e.get("step")
        if _is_int(s):
            step = s
        t = e.get("total")
        if _is_int(t):
            total = t
        et = e.get("eta_minutes")
        if _is_number(et):
            eta_minutes = et

    if last["phase"] == "done":
        status: Literal["active", "blocked", "done"] = "done"
    elif last["phase"] == "blocked":
        status = "blocked"
    else:
        status = "active"

    blocked = (
        ArcBlocker(title=last["title"], sent_at=last["sent_at"], body=last.get("body"))
        if last["phase"] == "blocked"
        else None
    )

    return ArcState(
        arc_id=first["arc_id"],
        title=started["title"] if started is not None else first["title"],
        phase=last["phase"],
        status=status,
        started_at=started["sent_at"] if started is not None else first["sent_at"],
        last_event_at=last["sent_at"],
        event_count=len(events),
        milestones=milestones,
        blocked=blocked,
        step=step,
        total=total,
        eta_minutes=eta_minutes,
    )
