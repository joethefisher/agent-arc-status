/**
 * Delegation-tree tooling built on the INTERIM `x_parent_arc_id` convention
 * (spec §12.1). This does NOT promote `parent_arc_id` to a first-class field:
 * the parent link is read from the `x_`-prefixed extension, so every event
 * stays schema-valid and no wire change is implied. The final field shape will
 * be derived from real delegation usage and only then promoted in a future
 * minor. Consumers MUST tolerate the convention's absence — with no
 * `x_parent_arc_id` present this degrades to a flat list of roots.
 *
 * `reduceArcForest` groups per-arc event streams into parent/child trees;
 * `renderArcForest` prints an indented tree. Orphans (a named parent absent from
 * the input) are surfaced AND rooted so delegated work is never hidden; cycles
 * are broken deterministically so the result is always a forest.
 */

import { reduceArc, type ArcState } from "./state.js";
import { render } from "./render.js";
import type { ArcStatusEvent } from "./types.js";

export interface ArcTreeNode {
  state: ArcState;
  children: ArcTreeNode[];
  /** Distance from a root (0 for roots). */
  depth: number;
}

export interface ArcForest {
  roots: ArcTreeNode[];
  /** Nodes whose `x_parent_arc_id` names a parent not present in the input.
   *  These are also included in `roots` so nothing is hidden. */
  orphans: ArcTreeNode[];
  /** arc_ids whose parent link was dropped to break a cycle. */
  cycleBroken: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Read the interim parent link: the `started` event's `x_parent_arc_id` if
 *  present, else the first event that carries one. Non-string values are ignored. */
function parentIdOf(events: ArcStatusEvent[]): string | undefined {
  const started = events.find((e) => e.phase === "started");
  const fromStarted = started ? asString(started["x_parent_arc_id"]) : undefined;
  if (fromStarted !== undefined) return fromStarted;
  for (const e of events) {
    const v = asString(e["x_parent_arc_id"]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function toEntries(
  input: Map<string, ArcStatusEvent[]> | Record<string, ArcStatusEvent[]>,
): Array<[string, ArcStatusEvent[]]> {
  return input instanceof Map ? [...input.entries()] : Object.entries(input);
}

/**
 * Group per-arc event streams into a forest by the `x_parent_arc_id` convention.
 * Empty streams are skipped. Returns roots, orphans, and any arc_ids whose link
 * was cut to break a cycle.
 */
export function reduceArcForest(
  eventsByArc: Map<string, ArcStatusEvent[]> | Record<string, ArcStatusEvent[]>,
): ArcForest {
  const nodes = new Map<string, ArcTreeNode>();
  const rawParent = new Map<string, string>();

  for (const [arcId, events] of toEntries(eventsByArc)) {
    const state = reduceArc(events);
    if (state === null) continue;
    nodes.set(arcId, { state, children: [], depth: 0 });
    const pid = parentIdOf(events);
    if (pid !== undefined) rawParent.set(arcId, pid);
  }

  // Effective parent links: only those whose parent is present in the input.
  const parentOf = new Map<string, string>();
  for (const [arcId, pid] of rawParent) {
    if (nodes.has(pid)) parentOf.set(arcId, pid);
  }

  // Break cycles: the parent graph is functional (≤1 parent per node), so a
  // cycle is a simple loop. Walk up from each node; on revisiting a node, cut
  // that node's parent link (making it a root) and record it.
  const cycleBroken: string[] = [];
  for (const start of nodes.keys()) {
    const seen = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        if (parentOf.has(cur)) {
          parentOf.delete(cur);
          cycleBroken.push(cur);
        }
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  const roots: ArcTreeNode[] = [];
  const orphans: ArcTreeNode[] = [];

  for (const [arcId, node] of nodes) {
    const parent = parentOf.get(arcId);
    if (parent !== undefined) {
      const parentNode = nodes.get(parent);
      if (parentNode) parentNode.children.push(node);
      continue;
    }
    roots.push(node);
    const pid = rawParent.get(arcId);
    if (pid !== undefined && !nodes.has(pid)) orphans.push(node);
  }

  const byStart = (a: ArcTreeNode, b: ArcTreeNode): number =>
    a.state.startedAt < b.state.startedAt
      ? -1
      : a.state.startedAt > b.state.startedAt
        ? 1
        : a.state.arc_id < b.state.arc_id
          ? -1
          : a.state.arc_id > b.state.arc_id
            ? 1
            : 0;

  const assignDepth = (node: ArcTreeNode, depth: number): void => {
    node.depth = depth;
    node.children.sort(byStart);
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  roots.sort(byStart);
  for (const root of roots) assignDepth(root, 0);

  return { roots, orphans, cycleBroken };
}

export interface RenderForestOptions {
  /** Indent unit per depth level. Default two spaces. */
  indent?: string;
  /** Render one node's state to a line. Default: phase symbol + title + status. */
  line?: (state: ArcState) => string;
}

function defaultLine(state: ArcState): string {
  const event: ArcStatusEvent = {
    arc_id: state.arc_id,
    phase: state.phase,
    title: state.title,
    sent_at: state.lastEventAt,
  };
  if (state.step !== undefined) event.step = state.step;
  if (state.total !== undefined) event.total = state.total;
  if (state.eta_minutes !== undefined) event.eta_minutes = state.eta_minutes;
  return `${render(event)}  (${state.status})`;
}

/** Render a forest to an indented, newline-joined tree of arc states. */
export function renderArcForest(forest: ArcForest, options: RenderForestOptions = {}): string {
  const indent = options.indent ?? "  ";
  const line = options.line ?? defaultLine;
  const out: string[] = [];

  const walk = (node: ArcTreeNode): void => {
    out.push(indent.repeat(node.depth) + line(node.state));
    for (const child of node.children) walk(child);
  };
  for (const root of forest.roots) walk(root);

  return out.join("\n");
}
