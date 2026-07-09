"""Runtime validator for arc.status events.

Mirrors the JSON Schema in ``spec/schema.json`` and the TypeScript reference
byte-for-byte in behaviour, hand-rolled so the package ships with zero runtime
dependencies. For canonical-schema validation use any JSON Schema validator
against ``spec/schema.json``; this validator's verdicts match it (with the two
documented divergences: ``step > total`` and calendar-impossible dates).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal, cast

from .types import ARC_STATUS_PHASES, ArcStatusEvent

# Canonical RFC 3339 grammar for ``sent_at``. MUST be byte-identical to
# ``spec/schema.json``'s ``sent_at.pattern`` — the equivalence test asserts it.
# (These adjacent string literals concatenate at parse time with no separators.)
RFC3339_PATTERN = (
    r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])"
    r"T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?"
    r"(Z|[+-](0\d|1[0-4]):[0-5]\d)$"
)

_RFC3339_RE = re.compile(RFC3339_PATTERN)
_PROTOCOL_VERSION_RE = re.compile(r"^\d+\.\d+(\.\d+)?$")

# The fields the Protocol defines. Any other key is a violation unless it is an
# ``x_``-prefixed extension (spec §3.2).
_KNOWN_KEYS = frozenset(
    {
        "arc_id",
        "phase",
        "title",
        "body",
        "step",
        "total",
        "eta_minutes",
        "sent_at",
        "arc_kind",
        "protocol_version",
    }
)


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    """A single validation failure, with a dot-path to the offending field."""

    path: str
    message: str


@dataclass(frozen=True, slots=True)
class ValidationOk:
    event: ArcStatusEvent
    ok: Literal[True] = True


@dataclass(frozen=True, slots=True)
class ValidationErr:
    issues: list[ValidationIssue]
    ok: Literal[False] = False


ValidationResult = ValidationOk | ValidationErr


def _is_int(value: object) -> bool:
    """True for a real int, excluding bool (``bool`` is an ``int`` subclass)."""
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value: object) -> bool:
    """True for int or float, excluding bool."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_valid_calendar_date(ts: str) -> bool:
    """Reject calendar-impossible dates the regex admits (e.g. 2026-02-30).

    Assumes ``ts`` already matched ``_RFC3339_RE`` so the slices are well-formed.
    """
    try:
        date(int(ts[0:4]), int(ts[5:7]), int(ts[8:10]))
        return True
    except ValueError:
        return False


def validate(candidate: object) -> ValidationResult:
    """Validate a candidate event against the Protocol's wire-format rules.

    Structural conformance only (required fields, types, enums, numeric bounds,
    timestamp). Does not check phase ordering — see :func:`validate_sequence`.
    """
    if not isinstance(candidate, dict):
        return ValidationErr([ValidationIssue("", "event must be a JSON object")])

    e = candidate
    issues: list[ValidationIssue] = []

    # unknown fields: only x_-prefixed extensions are permitted (spec §3.2)
    for key in e:
        if key not in _KNOWN_KEYS and not (isinstance(key, str) and key.startswith("x_")):
            issues.append(
                ValidationIssue(
                    str(key), "unknown field; only x_-prefixed extensions are permitted"
                )
            )

    # arc_id
    arc_id = e.get("arc_id")
    if not isinstance(arc_id, str):
        issues.append(ValidationIssue("arc_id", "must be a string"))
    elif len(arc_id) < 1 or len(arc_id) > 128:
        issues.append(ValidationIssue("arc_id", "must be between 1 and 128 characters"))

    # phase
    if e.get("phase") not in ARC_STATUS_PHASES:
        issues.append(ValidationIssue("phase", "must be one of: " + ", ".join(ARC_STATUS_PHASES)))

    # title
    title = e.get("title")
    if not isinstance(title, str):
        issues.append(ValidationIssue("title", "must be a string"))
    elif len(title) < 1 or len(title) > 200:
        issues.append(ValidationIssue("title", "must be between 1 and 200 characters"))
    elif "\n" in title:
        issues.append(
            ValidationIssue(
                "title", "should not contain newlines (use body for multi-line content)"
            )
        )

    # sent_at
    sent_at = e.get("sent_at")
    if not isinstance(sent_at, str):
        issues.append(ValidationIssue("sent_at", "must be a string"))
    elif not _RFC3339_RE.match(sent_at):
        issues.append(
            ValidationIssue(
                "sent_at",
                "must be an RFC 3339 timestamp (canonical: YYYY-MM-DDTHH:MM:SS[.fff]Z)",
            )
        )
    elif not _is_valid_calendar_date(sent_at):
        issues.append(ValidationIssue("sent_at", "is not a valid calendar date"))

    # body
    if "body" in e:
        body = e["body"]
        if not isinstance(body, str):
            issues.append(ValidationIssue("body", "must be a string when present"))
        elif len(body) > 32000:
            issues.append(ValidationIssue("body", "must be ≤ 32000 characters"))

    # step
    if "step" in e:
        step = e["step"]
        if not _is_int(step) or cast(int, step) < 1:
            issues.append(ValidationIssue("step", "must be an integer ≥ 1"))

    # total
    if "total" in e:
        total = e["total"]
        if not _is_int(total) or cast(int, total) < 1:
            issues.append(ValidationIssue("total", "must be an integer ≥ 1"))

    # step <= total
    step_v = e.get("step")
    total_v = e.get("total")
    if _is_int(step_v) and _is_int(total_v) and cast(int, step_v) > cast(int, total_v):
        issues.append(ValidationIssue("step", "must be ≤ total when both are present"))

    # eta_minutes
    if "eta_minutes" in e:
        eta = e["eta_minutes"]
        if not _is_number(eta) or cast(float, eta) < 0:
            issues.append(ValidationIssue("eta_minutes", "must be a number ≥ 0"))

    # arc_kind
    if "arc_kind" in e:
        arc_kind = e["arc_kind"]
        if not isinstance(arc_kind, str):
            issues.append(ValidationIssue("arc_kind", "must be a string when present"))
        elif len(arc_kind) > 64:
            issues.append(ValidationIssue("arc_kind", "must be ≤ 64 characters"))

    # protocol_version
    if "protocol_version" in e:
        pv = e["protocol_version"]
        if not isinstance(pv, str):
            issues.append(ValidationIssue("protocol_version", "must be a string when present"))
        elif not _PROTOCOL_VERSION_RE.match(pv):
            issues.append(
                ValidationIssue("protocol_version", "must match <major>.<minor>(.<patch>)?")
            )

    if issues:
        return ValidationErr(issues)
    return ValidationOk(cast("ArcStatusEvent", e))


@dataclass(frozen=True, slots=True)
class SequenceIssue:
    index: int
    message: str


@dataclass(frozen=True, slots=True)
class SequenceResult:
    ok: bool
    issues: list[SequenceIssue]


def _parse_ts(value: object) -> float | None:
    """Parse a timestamp to a comparable epoch, or None if unparseable."""
    if not isinstance(value, str):
        return None
    try:
        from datetime import datetime

        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def validate_sequence(
    events: list[ArcStatusEvent],
    *,
    partial: bool = False,
    check_monotonic_sent_at: bool = False,
) -> SequenceResult:
    """Validate phase-ordering for a sequence of events belonging to one arc.

    Enforces sections 4.5-4.6: exactly one ``started`` first; a terminal last (unless
    ``partial``); at most one ``done`` with nothing after it; legal ``blocked``
    resumes (``started``/``heartbeat``/consecutive ``blocked`` are illegal); and,
    when ``check_monotonic_sent_at`` is set, non-decreasing ``sent_at``.
    """
    issues: list[SequenceIssue] = []

    if len(events) == 0:
        return SequenceResult(True, issues)

    arc_id = events[0].get("arc_id")
    for i in range(1, len(events)):
        if events[i].get("arc_id") != arc_id:
            issues.append(
                SequenceIssue(
                    i, f"arc_id mismatch: expected {arc_id}, got {events[i].get('arc_id')}"
                )
            )

    if events[0].get("phase") != "started":
        issues.append(SequenceIssue(0, "first event in an arc must be phase=started"))

    started_count = sum(1 for e in events if e.get("phase") == "started")
    done_count = sum(1 for e in events if e.get("phase") == "done")
    saw_done_at = next((i for i, e in enumerate(events) if e.get("phase") == "done"), None)

    if started_count != 1:
        issues.append(
            SequenceIssue(0, f"arc must contain exactly one started event, found {started_count}")
        )

    if done_count > 1:
        issues.append(
            SequenceIssue(0, f"arc must contain at most one done event, found {done_count}")
        )

    if saw_done_at is not None and saw_done_at != len(events) - 1:
        issues.append(SequenceIssue(saw_done_at, "no events may follow a done event"))

    for i in range(len(events) - 1):
        if events[i].get("phase") == "blocked":
            nxt = events[i + 1].get("phase")
            if nxt == "started":
                issues.append(SequenceIssue(i + 1, "started cannot follow blocked"))
            if nxt == "heartbeat":
                issues.append(
                    SequenceIssue(
                        i + 1,
                        "blocked must be followed by milestone (resume), done (resolve), or "
                        "end-of-arc; heartbeat is not a legal resume signal",
                    )
                )
            if nxt == "blocked":
                issues.append(
                    SequenceIssue(
                        i + 1,
                        "consecutive blocked events are not allowed; emit a milestone (resume) "
                        "before re-blocking (§4.5)",
                    )
                )

    if not partial:
        last_phase = events[-1].get("phase")
        if last_phase != "done" and last_phase != "blocked":
            issues.append(
                SequenceIssue(
                    len(events) - 1,
                    "a complete arc must end in a terminal event (done or terminal blocked); pass "
                    "partial=True to validate an in-flight prefix",
                )
            )

    if check_monotonic_sent_at:
        for i in range(1, len(events)):
            prev = _parse_ts(events[i - 1].get("sent_at"))
            cur = _parse_ts(events[i].get("sent_at"))
            if prev is not None and cur is not None and cur < prev:
                issues.append(
                    SequenceIssue(
                        i,
                        "sent_at decreased from the previous event; not allowed when "
                        "check_monotonic_sent_at is set",
                    )
                )

    return SequenceResult(len(issues) == 0, issues)
