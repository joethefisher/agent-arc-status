"""Wire types for arc.status events.

These mirror the JSON Schema in ``spec/schema.json`` and the TypeScript reference.
The event is modeled as a ``TypedDict`` (base-required + optional inheritance) so
it *is* a plain ``dict`` at runtime: ``json.dumps``/``json.loads`` round-trip with
no conversion and ``x_``-prefixed extension keys pass through untouched. The
``x_`` extension convention cannot be expressed in a ``TypedDict`` key; it is
enforced at runtime by :func:`agent_arc_status.validate.validate`.
"""

from __future__ import annotations

from typing import Literal, TypedDict

ArcStatusPhase = Literal["started", "milestone", "heartbeat", "done", "blocked"]

ARC_STATUS_PHASES: tuple[ArcStatusPhase, ...] = (
    "started",
    "milestone",
    "heartbeat",
    "done",
    "blocked",
)


class _ArcStatusEventRequired(TypedDict):
    arc_id: str
    phase: ArcStatusPhase
    title: str
    sent_at: str


class ArcStatusEvent(_ArcStatusEventRequired, total=False):
    body: str
    step: int
    total: int
    eta_minutes: float
    arc_kind: str
    protocol_version: str
    # Application-specific ``x_``-prefixed extensions are permitted at runtime
    # (validated by validate()); TypedDict cannot express the pattern key.
