from __future__ import annotations

from collections.abc import Callable

from agent_arc_status import ArcStatusEvent, parse, parse_jsonl

VALID = '{"arc_id":"a","phase":"started","title":"t","sent_at":"2026-06-14T09:00:00Z"}'
DONE = '{"arc_id":"a","phase":"done","title":"d","sent_at":"2026-06-14T09:10:00Z"}'


def test_parse_ok() -> None:
    assert parse(VALID).ok


def test_parse_bytes() -> None:
    assert parse(VALID.encode("utf-8")).ok


def test_parse_bad_json_does_not_raise() -> None:
    result = parse("{not json")
    assert not result.ok


def test_jsonl_skips_blank_lines() -> None:
    result = parse_jsonl(VALID + "\n\n   \n" + DONE)
    assert len(result.events) == 2
    assert result.errors == []


def test_jsonl_reports_error_line_index() -> None:
    result = parse_jsonl("not json\n" + VALID)
    assert len(result.events) == 1
    assert len(result.errors) == 1
    assert result.errors[0].line == 0


def test_jsonl_handles_crlf() -> None:
    result = parse_jsonl(VALID + "\r\n" + DONE)
    assert len(result.events) == 2


def test_examples_parse_to_expected_counts(
    examples: Callable[[str], list[ArcStatusEvent]],
) -> None:
    assert len(examples("03-long-autonomous.jsonl")) == 12
    assert len(examples("02-feature-build.jsonl")) == 6
