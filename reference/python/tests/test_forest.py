from __future__ import annotations

from typing import Any, cast

from agent_arc_status import (
    ArcStatusEvent,
    reduce_arc_forest,
    render_arc_forest,
    validate,
)


def arc(
    arc_id: str,
    *,
    parent: str | None = None,
    title: str | None = None,
    minute: int = 0,
) -> list[ArcStatusEvent]:
    """A minimal complete arc, optionally with an x_parent_arc_id link."""
    mm = f"{minute:02d}"
    started: dict[str, Any] = {
        "arc_id": arc_id,
        "phase": "started",
        "title": title or arc_id,
        "sent_at": f"2026-06-14T09:{mm}:00Z",
    }
    if parent is not None:
        started["x_parent_arc_id"] = parent
    done: dict[str, Any] = {
        "arc_id": arc_id,
        "phase": "done",
        "title": f"{arc_id} done",
        "sent_at": f"2026-06-14T09:{mm}:30Z",
    }
    return [cast(ArcStatusEvent, started), cast(ArcStatusEvent, done)]


def test_degrades_to_flat_list_without_parent_links() -> None:
    forest = reduce_arc_forest({"a": arc("a"), "b": arc("b", minute=1)})
    assert [n.state.arc_id for n in forest.roots] == ["a", "b"]
    assert all(n.depth == 0 and not n.children for n in forest.roots)
    assert forest.orphans == []
    assert forest.cycle_broken == []


def test_nests_children_under_parent() -> None:
    forest = reduce_arc_forest(
        {
            "root": arc("root"),
            "childA": arc("childA", parent="root", minute=1),
            "childB": arc("childB", parent="root", minute=2),
            "grandchild": arc("grandchild", parent="childA", minute=3),
        }
    )
    assert [n.state.arc_id for n in forest.roots] == ["root"]
    root = forest.roots[0]
    assert [n.state.arc_id for n in root.children] == ["childA", "childB"]
    assert [n.state.arc_id for n in root.children[0].children] == ["grandchild"]
    assert root.children[0].children[0].depth == 2


def test_surfaces_and_roots_orphan() -> None:
    forest = reduce_arc_forest({"child": arc("child", parent="ghost")})
    assert [n.state.arc_id for n in forest.orphans] == ["child"]
    assert [n.state.arc_id for n in forest.roots] == ["child"]


def test_breaks_cycle_and_keeps_all_reachable() -> None:
    forest = reduce_arc_forest(
        {
            "a": arc("a", parent="c"),
            "b": arc("b", parent="a", minute=1),
            "c": arc("c", parent="b", minute=2),
        }
    )
    assert len(forest.cycle_broken) == 1
    seen: set[str] = set()

    def walk(node: Any) -> None:
        seen.add(node.state.arc_id)
        for child in node.children:
            walk(child)

    for root in forest.roots:
        walk(root)
    assert sorted(seen) == ["a", "b", "c"]


def test_events_with_x_parent_arc_id_stay_schema_valid() -> None:
    for event in arc("child", parent="root"):
        assert validate(event).ok


def test_render_indents_children() -> None:
    forest = reduce_arc_forest(
        {
            "root": arc("root", title="ship migration"),
            "child": arc("child", parent="root", title="schema backfill", minute=1),
        }
    )
    lines = render_arc_forest(forest).split("\n")
    assert lines[0] == "■ ship migration  (done)"
    assert lines[1] == "  ■ schema backfill  (done)"
