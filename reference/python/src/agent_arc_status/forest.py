"""Delegation-tree tooling built on the INTERIM ``x_parent_arc_id`` convention
(spec §12.1). This does NOT promote ``parent_arc_id`` to a first-class field:
the parent link is read from the ``x_``-prefixed extension, so every event stays
schema-valid and no wire change is implied. With no ``x_parent_arc_id`` present
this degrades to a flat list of roots. Orphans (a named parent absent from the
input) are surfaced AND rooted so delegated work is never hidden; cycles are
broken deterministically so the result is always a forest.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import cast

from .render import render
from .state import ArcState, reduce_arc
from .types import ArcStatusEvent


@dataclass
class ArcTreeNode:
    state: ArcState
    children: list[ArcTreeNode] = field(default_factory=list)
    #: Distance from a root (0 for roots).
    depth: int = 0


@dataclass
class ArcForest:
    roots: list[ArcTreeNode]
    #: Nodes whose ``x_parent_arc_id`` names a parent absent from the input.
    #: Also included in ``roots`` so nothing is hidden.
    orphans: list[ArcTreeNode]
    #: arc_ids whose parent link was dropped to break a cycle.
    cycle_broken: list[str]


def _ext(event: ArcStatusEvent, key: str) -> object:
    """Read an ``x_``-prefixed extension value off an event (untyped at compile
    time; the event is a plain dict at runtime)."""
    return cast("dict[str, object]", event).get(key)


def _as_string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _parent_id_of(events: list[ArcStatusEvent]) -> str | None:
    started = next((e for e in events if e["phase"] == "started"), None)
    if started is not None:
        from_started = _as_string(_ext(started, "x_parent_arc_id"))
        if from_started is not None:
            return from_started
    for e in events:
        v = _as_string(_ext(e, "x_parent_arc_id"))
        if v is not None:
            return v
    return None


def reduce_arc_forest(events_by_arc: Mapping[str, list[ArcStatusEvent]]) -> ArcForest:
    """Group per-arc event streams into a forest by the ``x_parent_arc_id``
    convention. Empty streams are skipped."""
    nodes: dict[str, ArcTreeNode] = {}
    raw_parent: dict[str, str] = {}

    for arc_id, events in events_by_arc.items():
        state = reduce_arc(events)
        if state is None:
            continue
        nodes[arc_id] = ArcTreeNode(state=state)
        pid = _parent_id_of(events)
        if pid is not None:
            raw_parent[arc_id] = pid

    # Effective parent links: only those whose parent is present in the input.
    parent_of: dict[str, str] = {
        aid: pid for aid, pid in raw_parent.items() if pid in nodes
    }

    # Break cycles: the parent graph is functional (<=1 parent per node), so a
    # cycle is a simple loop. Walk up from each node; on revisiting a node, cut
    # that node's parent link (making it a root) and record it.
    cycle_broken: list[str] = []
    for start in list(nodes.keys()):
        seen: set[str] = set()
        cur: str | None = start
        while cur is not None:
            if cur in seen:
                if cur in parent_of:
                    del parent_of[cur]
                    cycle_broken.append(cur)
                break
            seen.add(cur)
            cur = parent_of.get(cur)

    roots: list[ArcTreeNode] = []
    orphans: list[ArcTreeNode] = []

    for arc_id, node in nodes.items():
        parent = parent_of.get(arc_id)
        if parent is not None:
            nodes[parent].children.append(node)
            continue
        roots.append(node)
        pid = raw_parent.get(arc_id)
        if pid is not None and pid not in nodes:
            orphans.append(node)

    def sort_key(node: ArcTreeNode) -> tuple[str, str]:
        return (node.state.started_at, node.state.arc_id)

    def assign_depth(node: ArcTreeNode, depth: int) -> None:
        node.depth = depth
        node.children.sort(key=sort_key)
        for child in node.children:
            assign_depth(child, depth + 1)

    roots.sort(key=sort_key)
    for root in roots:
        assign_depth(root, 0)

    return ArcForest(roots=roots, orphans=orphans, cycle_broken=cycle_broken)


def _default_line(state: ArcState) -> str:
    event: ArcStatusEvent = {
        "arc_id": state.arc_id,
        "phase": state.phase,
        "title": state.title,
        "sent_at": state.last_event_at,
    }
    if state.step is not None:
        event["step"] = state.step
    if state.total is not None:
        event["total"] = state.total
    if state.eta_minutes is not None:
        event["eta_minutes"] = state.eta_minutes
    return f"{render(event)}  ({state.status})"


def render_arc_forest(
    forest: ArcForest,
    *,
    indent: str = "  ",
    line: Callable[[ArcState], str] | None = None,
) -> str:
    """Render a forest to an indented, newline-joined tree of arc states."""
    render_line = line if line is not None else _default_line
    out: list[str] = []

    def walk(node: ArcTreeNode) -> None:
        out.append(indent * node.depth + render_line(node.state))
        for child in node.children:
            walk(child)

    for root in forest.roots:
        walk(root)

    return "\n".join(out)
