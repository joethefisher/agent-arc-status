"""Agent Arc Status Protocol: Python reference implementation (protocol v0.2).

A faithful, zero-dependency port of the TypeScript reference. Spec:
https://github.com/joethefisher/agent-arc-status
"""

from __future__ import annotations

from .cadence import (
    ArcSeed,
    CadenceConfig,
    CadenceController,
    SilenceWatchdog,
    StalledArc,
)
from .parse import JsonlLineError, JsonlParseResult, parse, parse_jsonl
from .render import render
from .state import ArcBlocker, ArcMilestone, ArcState, reduce_arc
from .types import ARC_STATUS_PHASES, ArcStatusEvent, ArcStatusPhase
from .validate import (
    RFC3339_PATTERN,
    SequenceIssue,
    SequenceResult,
    ValidationErr,
    ValidationIssue,
    ValidationOk,
    ValidationResult,
    validate,
    validate_sequence,
)

#: The Protocol version this package implements.
PROTOCOL_VERSION = "0.2.0"

__all__ = [
    "ARC_STATUS_PHASES",
    "PROTOCOL_VERSION",
    "RFC3339_PATTERN",
    "ArcBlocker",
    "ArcMilestone",
    "ArcSeed",
    "ArcState",
    "ArcStatusEvent",
    "ArcStatusPhase",
    "CadenceConfig",
    "CadenceController",
    "JsonlLineError",
    "JsonlParseResult",
    "SequenceIssue",
    "SequenceResult",
    "SilenceWatchdog",
    "StalledArc",
    "ValidationErr",
    "ValidationIssue",
    "ValidationOk",
    "ValidationResult",
    "parse",
    "parse_jsonl",
    "reduce_arc",
    "render",
    "validate",
    "validate_sequence",
]
