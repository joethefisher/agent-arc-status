from __future__ import annotations

from collections.abc import Callable

from agent_arc_status import ArcStatusEvent, reduce_arc


def test_empty_returns_none() -> None:
    assert reduce_arc([]) is None


def test_folds_feature_build_to_done(
    examples: Callable[[str], list[ArcStatusEvent]],
) -> None:
    state = reduce_arc(examples("02-feature-build.jsonl"))
    assert state is not None
    assert state.status == "done"
    assert state.phase == "done"
    assert state.blocked is None
    assert len(state.milestones) >= 1


def test_terminal_blocked_holds_blocker(
    examples: Callable[[str], list[ArcStatusEvent]],
) -> None:
    state = reduce_arc(examples("05-terminal-blocked.jsonl"))
    assert state is not None
    assert state.status == "blocked"
    assert state.blocked is not None
    assert state.blocked.title


def test_blocked_then_resumed_clears_blocker(
    examples: Callable[[str], list[ArcStatusEvent]],
) -> None:
    state = reduce_arc(examples("04-blocked-and-resumed.jsonl"))
    assert state is not None
    assert state.status == "done"
    assert state.blocked is None
