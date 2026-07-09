/**
 * @agent-arc-status/adapter-otel — record arc.status events as OpenTelemetry
 * span events and carry the arc_id as a span attribute (docs/comparison.md).
 * The mapping is arc -> OTel only: arc milestones are coarser than spans, and
 * the cadence/silence discipline has no OTel equivalent.
 *
 * Uses a structural `SpanLike` (the subset of `@opentelemetry/api`'s `Span` this
 * touches) so the adapter carries no hard dependency; `@opentelemetry/api` is a
 * peer.
 */

import type { ArcStatusEvent, EmitFn } from "@agent-arc-status/reference";

/** The subset of an OpenTelemetry `Span` this adapter uses. */
export interface SpanLike {
  setAttribute(key: string, value: string | number | boolean): unknown;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): unknown;
  setStatus(status: { code: number; message?: string }): unknown;
}

/** Span attribute that correlates a span back to an arc. */
export const AGENT_ARC_ID_ATTR = "agent.arc.id";

// OpenTelemetry SpanStatusCode: UNSET = 0, OK = 1, ERROR = 2.
const STATUS_OK = 1;
const STATUS_ERROR = 2;

/**
 * Record one arc.status event on a span: set `agent.arc.id`, add an
 * `arc.<phase>` span event with the step/total/eta attributes, and set the span
 * status on terminal phases (`done` -> OK, `blocked` -> ERROR).
 */
export function recordArcEvent(span: SpanLike, event: ArcStatusEvent): void {
  span.setAttribute(AGENT_ARC_ID_ATTR, event.arc_id);

  const attributes: Record<string, string | number | boolean> = { "arc.title": event.title };
  if (event.arc_kind !== undefined) attributes["arc.kind"] = event.arc_kind;
  if (event.step !== undefined) attributes["arc.step"] = event.step;
  if (event.total !== undefined) attributes["arc.total"] = event.total;
  if (event.eta_minutes !== undefined) attributes["arc.eta_minutes"] = event.eta_minutes;
  span.addEvent(`arc.${event.phase}`, attributes);

  if (event.phase === "done") span.setStatus({ code: STATUS_OK });
  if (event.phase === "blocked") span.setStatus({ code: STATUS_ERROR, message: event.title });
}

/** An {@link EmitFn} sink that records every event onto the given span. */
export function arcEmitterForSpan(span: SpanLike): EmitFn {
  return (event) => recordArcEvent(span, event);
}
