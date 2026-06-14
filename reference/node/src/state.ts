/**
 * Fold an ordered event stream into the current state of an arc: the cheap
 * "what is true now?" reduction that design-rationale.md promises the reference
 * implementation provides. Append-only events compose with any transport; this
 * reconstructs current state for consumers that want a snapshot rather than a
 * timeline. Pure, zero dependencies.
 */

import type { ArcStatusEvent, ArcStatusPhase } from "./types.js";

export interface ArcMilestone {
  title: string;
  sent_at: string;
  step?: number;
  total?: number;
}

export interface ArcState {
  arc_id: string;
  /** Objective, taken from the `started` event (falls back to the first event). */
  title: string;
  /** Phase of the most recent event. */
  phase: ArcStatusPhase;
  /** Derived lifecycle status. `blocked` clears once a later non-blocked event arrives. */
  status: "active" | "blocked" | "done";
  /** Latest `step`/`total`/`eta_minutes` seen on any event, if present. */
  step?: number;
  total?: number;
  eta_minutes?: number;
  startedAt: string;
  lastEventAt: string;
  eventCount: number;
  milestones: ArcMilestone[];
  /** The current blocker if the most recent event is `blocked`, else null. */
  blocked: { title: string; body?: string; sent_at: string } | null;
}

/**
 * Reduce an ordered sequence of events for a single arc into current state.
 * Returns null for an empty sequence. Does not validate the sequence; pass a
 * sequence you trust (or run `validateSequence` first).
 */
export function reduceArc(events: ArcStatusEvent[]): ArcState | null {
  if (events.length === 0) return null;

  const first = events[0]!;
  const last = events[events.length - 1]!;
  const started = events.find((e) => e.phase === "started");

  const milestones: ArcMilestone[] = [];
  let step: number | undefined;
  let total: number | undefined;
  let eta_minutes: number | undefined;

  for (const e of events) {
    if (e.phase === "milestone") {
      milestones.push({
        title: e.title,
        sent_at: e.sent_at,
        step: e.step,
        total: e.total,
      });
    }
    if (typeof e.step === "number") step = e.step;
    if (typeof e.total === "number") total = e.total;
    if (typeof e.eta_minutes === "number") eta_minutes = e.eta_minutes;
  }

  const status: ArcState["status"] =
    last.phase === "done"
      ? "done"
      : last.phase === "blocked"
        ? "blocked"
        : "active";

  const blocked =
    last.phase === "blocked"
      ? { title: last.title, body: last.body, sent_at: last.sent_at }
      : null;

  return {
    arc_id: first.arc_id,
    title: started?.title ?? first.title,
    phase: last.phase,
    status,
    step,
    total,
    eta_minutes,
    startedAt: started?.sent_at ?? first.sent_at,
    lastEventAt: last.sent_at,
    eventCount: events.length,
    milestones,
    blocked,
  };
}
