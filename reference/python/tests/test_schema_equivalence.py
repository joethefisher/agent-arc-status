from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from agent_arc_status import RFC3339_PATTERN, ArcStatusEvent

SCHEMA = json.loads((Path(__file__).resolve().parents[3] / "spec" / "schema.json").read_text())


def test_rfc3339_pattern_matches_schema_byte_for_byte() -> None:
    # The drift guard: the Python constant MUST equal the schema's sent_at pattern,
    # or an emitter validating against the schema and a consumer using this library
    # would disagree on which timestamps are valid.
    assert SCHEMA["properties"]["sent_at"]["pattern"] == RFC3339_PATTERN


def test_example_events_validate_against_the_schema(
    examples: Callable[[str], list[ArcStatusEvent]],
) -> None:
    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(SCHEMA)
    for name in (
        "02-feature-build.jsonl",
        "03-long-autonomous.jsonl",
        "04-blocked-and-resumed.jsonl",
        "05-terminal-blocked.jsonl",
    ):
        for event in examples(name):
            assert validator.is_valid(event)
