"""Parsing helpers: wrap ``json.loads`` with validation. Never raise."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from .types import ArcStatusEvent
from .validate import ValidationErr, ValidationIssue, ValidationOk, ValidationResult, validate

# Mirror the TS ``split(/\r?\n/)`` exactly; ``str.splitlines()`` also breaks on
# \v, \f, \x1c and U+2028 which would diverge on adversarial input.
_LINE_SPLIT = re.compile(r"\r?\n")


def parse(data: str | bytes) -> ValidationResult:
    """Parse a single JSON string/bytes into a validated event."""
    text = data.decode("utf-8") if isinstance(data, bytes) else data
    try:
        parsed = json.loads(text)
    except ValueError as err:
        return ValidationErr([ValidationIssue("", f"not valid JSON: {err}")])
    return validate(parsed)


@dataclass(frozen=True, slots=True)
class JsonlLineError:
    line: int
    issues: list[ValidationIssue]


@dataclass(frozen=True, slots=True)
class JsonlParseResult:
    events: list[ArcStatusEvent]
    errors: list[JsonlLineError]


def parse_jsonl(data: str | bytes) -> JsonlParseResult:
    """Parse a JSON Lines stream. Empty lines are skipped; errors are collected
    per 0-indexed line rather than raised."""
    text = data.decode("utf-8") if isinstance(data, bytes) else data
    lines = _LINE_SPLIT.split(text)

    events: list[ArcStatusEvent] = []
    errors: list[JsonlLineError] = []

    for i, raw in enumerate(lines):
        if raw.strip() == "":
            continue
        result = parse(raw)
        if isinstance(result, ValidationOk):
            events.append(result.event)
        else:
            errors.append(JsonlLineError(i, result.issues))

    return JsonlParseResult(events, errors)
