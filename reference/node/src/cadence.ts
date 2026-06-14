/**
 * Cadence discipline as executable code — the part of the Protocol that the
 * v0.1 reference left as prose.
 *
 *   - `CadenceController` drives one arc's emission discipline: it gates
 *     sub-floor arcs (§5.1), emits a (possibly retroactive) `started` once the
 *     cadence floor is crossed, and fires a `heartbeat` when the silence window
 *     (§5.2) would otherwise elapse with no event.
 *   - `SilenceWatchdog` is a consumer/sidecar that detects stalls across many
 *     arcs using LOCAL receipt time, never the event's `sent_at` (§7.5).
 *
 * Both take an injectable `now()` so behaviour is deterministic under test, and
 * are meant to be driven by a timer INDEPENDENT of the work loop (§5.2): an
 * emitter that drives its own heartbeat from the work loop cannot honour the
 * silence backstop in the one case it exists for — when the work loop is what
 * stalled. Zero dependencies.
 */

import type { ArcStatusEvent, ArcStatusPhase } from "./types.js";

const DEFAULT_FLOOR_MS = 5 * 60_000;
const DEFAULT_WINDOW_MS = 20 * 60_000;

export interface CadenceConfig {
  /** Minimum arc age before any event is emitted. Default 5 min (§5.1). */
  cadenceFloorMs?: number;
  /** Max silence before a heartbeat is required. Default 20 min (§5.2). */
  silenceWindowMs?: number;
  /** Injectable clock in ms epoch. Default `Date.now`. */
  now?: () => number;
}

/** The minimum an arc needs to begin emitting; threaded onto generated events. */
export interface ArcSeed {
  arc_id: string;
  title: string;
  arc_kind?: string;
  protocol_version?: string;
}

/**
 * Per-arc emission controller. Owns the `started` and `heartbeat` events; the
 * caller emits `milestone`/`blocked`/`done` itself and reports them via
 * {@link CadenceController.onEmit} so the silence timer resets.
 */
export class CadenceController {
  private readonly floorMs: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private seed: ArcSeed | null = null;
  private beganAt = 0;
  private startedEmitted = false;
  private terminal = false;
  private lastEmitAt = 0;

  constructor(config: CadenceConfig = {}) {
    this.floorMs = config.cadenceFloorMs ?? DEFAULT_FLOOR_MS;
    this.windowMs = config.silenceWindowMs ?? DEFAULT_WINDOW_MS;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Register the start of an arc. Per §5.1 the floor is a DELAY threshold, not
   * a prediction: nothing is emitted until the arc has been alive for the
   * cadence floor, so an arc that was expected to be short but runs long still
   * becomes visible at the floor. Returns a `started` event immediately only
   * when the floor is 0.
   */
  begin(seed: ArcSeed): ArcStatusEvent | null {
    this.seed = seed;
    this.beganAt = this.now();
    this.startedEmitted = false;
    this.terminal = false;
    this.lastEmitAt = 0;
    return this.maybeEmitStarted();
  }

  /**
   * Report an event the caller emitted (milestone, blocked, done) so the
   * silence timer resets. `done` marks the arc terminal.
   */
  onEmit(event: ArcStatusEvent): void {
    this.lastEmitAt = this.now();
    if (event.phase === "started") this.startedEmitted = true;
    if (event.phase === "done") this.terminal = true;
  }

  /**
   * Drive the cadence. Call on a timer independent of the work loop. Returns an
   * event to emit, or null: the (possibly retroactive) `started` once the floor
   * is crossed, then a `heartbeat` once the silence window elapses with no
   * emit. `currentActivity` becomes the heartbeat title (§4.3).
   */
  tick(currentActivity?: string): ArcStatusEvent | null {
    if (this.terminal || !this.seed) return null;
    if (!this.startedEmitted) return this.maybeEmitStarted();
    if (this.now() - this.lastEmitAt >= this.windowMs) {
      return this.emit("heartbeat", currentActivity ?? "still working");
    }
    return null;
  }

  /** True once a `done` has been reported. */
  isTerminal(): boolean {
    return this.terminal;
  }

  private maybeEmitStarted(): ArcStatusEvent | null {
    if (this.startedEmitted || this.terminal || !this.seed) return null;
    if (this.now() - this.beganAt < this.floorMs) return null;
    this.startedEmitted = true;
    return this.emit("started", this.seed.title);
  }

  private emit(phase: ArcStatusPhase, title: string): ArcStatusEvent {
    const t = this.now();
    this.lastEmitAt = t;
    const seed = this.seed!;
    const event: ArcStatusEvent = {
      arc_id: seed.arc_id,
      phase,
      title,
      sent_at: new Date(t).toISOString(),
    };
    if (seed.arc_kind) event.arc_kind = seed.arc_kind;
    if (seed.protocol_version) event.protocol_version = seed.protocol_version;
    return event;
  }
}

/** An arc that has been silent past the window. */
export interface StalledArc {
  arc_id: string;
  /** Local receipt time of the arc's most recent event. */
  lastReceiptMs: number;
  /** How long the arc has been silent, in ms. */
  silentMs: number;
}

/**
 * Multi-arc stall detector for a consumer or sidecar. Tracks the LOCAL receipt
 * time of each arc's most recent event and reports the arcs that have gone
 * quiet past the silence window — including those whose own heartbeat is
 * missing, which is the failure the backstop exists to surface.
 */
export class SilenceWatchdog {
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly lastReceipt = new Map<string, number>();

  constructor(config: CadenceConfig = {}) {
    this.windowMs = config.silenceWindowMs ?? DEFAULT_WINDOW_MS;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Record receipt of an event for an arc. Uses LOCAL receipt time, never the
   * event's `sent_at` (§7.5: `sent_at` is for ordering/display, so a sender
   * with a skewed clock or a delayed delivery must not be able to look alive).
   */
  record(arcId: string, receiptMs: number = this.now()): void {
    this.lastReceipt.set(arcId, receiptMs);
  }

  /** Arcs whose last receipt is older than the silence window. */
  stalled(nowMs: number = this.now()): StalledArc[] {
    const out: StalledArc[] = [];
    for (const [arc_id, lastReceiptMs] of this.lastReceipt) {
      const silentMs = nowMs - lastReceiptMs;
      if (silentMs >= this.windowMs) out.push({ arc_id, lastReceiptMs, silentMs });
    }
    return out;
  }

  /** Stop tracking an arc (e.g. after it reaches a terminal event). */
  forget(arcId: string): void {
    this.lastReceipt.delete(arcId);
  }
}
