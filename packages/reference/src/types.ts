/**
 * Agent Arc Status Protocol v0.2: TypeScript types.
 *
 * These mirror the JSON Schema in `spec/schema.json`. They are the
 * authoritative type-level representation of a conformant event.
 */

export const ARC_STATUS_PHASES = [
  "started",
  "milestone",
  "heartbeat",
  "done",
  "blocked",
] as const;

export type ArcStatusPhase = (typeof ARC_STATUS_PHASES)[number];

export interface ArcStatusEvent {
  /** Stable identifier for the arc. All events in one arc share this value. */
  arc_id: string;
  /** Lifecycle position of the arc at the moment of emission. */
  phase: ArcStatusPhase;
  /** Short human-readable label for this event. */
  title: string;
  /** Longer freeform body, optionally containing markdown. */
  body?: string;
  /** 1-indexed step number within a sequenced arc. */
  step?: number;
  /** Total number of steps in a sequenced arc. */
  total?: number;
  /** Emitter's current estimate of minutes remaining to done. */
  eta_minutes?: number;
  /** UTC timestamp at which the event was generated (RFC 3339). */
  sent_at: string;
  /** Optional free-form label naming the kind of work. */
  arc_kind?: string;
  /** The Protocol version the emitter targets, e.g. "0.1". */
  protocol_version?: string;
  /** Application-specific extensions MUST use the `x_` prefix. */
  [extension: `x_${string}`]: unknown;
}

/**
 * A sink for arc.status events — the injection point that emitters, transports,
 * and framework adapters accept so they stay decoupled from any one transport.
 */
export type EmitFn = (event: ArcStatusEvent) => void | Promise<void>;
