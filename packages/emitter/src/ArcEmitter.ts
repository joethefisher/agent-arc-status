import { randomUUID } from "node:crypto";
import {
  CadenceController,
  PROTOCOL_VERSION,
  validate,
  type ArcStatusEvent,
  type ArcStatusPhase,
  type CadenceConfig,
} from "@agent-arc-status/reference";
import type { Transport } from "./transport.js";

/** Minimal timer surface, injectable for deterministic tests. */
export interface TimerLike {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ArcEmitterConfig {
  /** The arc's objective; becomes the `started` title. */
  title: string;
  /** Where validated events are sent. */
  transport: Transport;
  /** Stable arc id. Default: a fresh UUID. */
  arcId?: string;
  arcKind?: string;
  /** Emitter's protocol_version. Default: the reference `PROTOCOL_VERSION`. */
  protocolVersion?: string;
  /** Cadence floor/window and injectable clock (shared with the emitter). */
  cadence?: CadenceConfig;
  /** Supplies the auto-heartbeat title. Default: "still working". */
  heartbeatActivity?: () => string;
  /** How often the backstop timer polls the cadence controller. Default 30s. */
  tickIntervalMs?: number;
  /** Injectable timer. Default: global setInterval/clearInterval (unref'd). */
  timer?: TimerLike;
  /** Called on a transport failure or an invalid event; never rethrows. */
  onError?: (error: unknown, event?: ArcStatusEvent) => void;
}

export interface EmitOptions {
  body?: string;
  step?: number;
  total?: number;
  eta_minutes?: number;
}

const defaultTimer: TimerLike = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * A batteries-included producer. It wraps the reference `CadenceController`
 * (which stays pure and timer-free — the emitter owns the interval), guarantees
 * a `started` leads the arc and a terminal ends it, and fires heartbeats from a
 * timer independent of the work loop (§5.2). Transport failures are swallowed
 * into `onError` so status reporting never crashes the workload.
 */
export class ArcEmitter {
  readonly arcId: string;
  readonly #config: ArcEmitterConfig;
  readonly #controller: CadenceController;
  readonly #now: () => number;
  readonly #timer: TimerLike;
  #handle: unknown = null;
  #startedSent = false;
  #terminal = false;

  constructor(config: ArcEmitterConfig) {
    this.#config = config;
    this.arcId = config.arcId ?? randomUUID();
    this.#controller = new CadenceController(config.cadence);
    this.#now = config.cadence?.now ?? (() => Date.now());
    this.#timer = config.timer ?? defaultTimer;
  }

  /** Begin the arc and start the backstop timer. */
  async start(): Promise<void> {
    const started = this.#controller.begin({
      arc_id: this.arcId,
      title: this.#config.title,
      arc_kind: this.#config.arcKind,
      protocol_version: this.#config.protocolVersion ?? PROTOCOL_VERSION,
    });
    if (started) {
      this.#startedSent = true;
      await this.#send(started);
    }
    this.#handle = this.#timer.setInterval(() => {
      void this.#onTick();
    }, this.#config.tickIntervalMs ?? 30_000);
    (this.#handle as { unref?: () => void }).unref?.();
  }

  async milestone(title: string, opts: EmitOptions = {}): Promise<void> {
    await this.#ensureStarted();
    await this.#emit("milestone", title, opts);
  }

  async heartbeat(title = "still working", opts: EmitOptions = {}): Promise<void> {
    await this.#ensureStarted();
    await this.#emit("heartbeat", title, opts);
  }

  async blocked(title: string, opts: EmitOptions = {}): Promise<void> {
    await this.#ensureStarted();
    await this.#emit("blocked", title, opts);
  }

  async done(title = "completed", opts: EmitOptions = {}): Promise<void> {
    await this.#ensureStarted();
    await this.#emit("done", title, opts);
    this.#stop();
  }

  isTerminal(): boolean {
    return this.#terminal;
  }

  /**
   * Run `fn` as the arc: guarantees `started` first, `done` on success or
   * terminal `blocked` on throw, and timer cleanup — so every produced stream is
   * sequence-valid regardless of how `fn` exits.
   */
  async run<T>(fn: (arc: ArcEmitter) => Promise<T>): Promise<T> {
    await this.start();
    try {
      const result = await fn(this);
      if (!this.#terminal) await this.done("completed");
      return result;
    } catch (error) {
      if (!this.#terminal) {
        await this.blocked(`failed: ${errorMessage(error)}`, { body: errorBody(error) });
      }
      throw error;
    } finally {
      this.#stop();
      if (this.#config.transport.close) await this.#config.transport.close();
    }
  }

  async #onTick(): Promise<void> {
    if (this.#terminal) return;
    const event = this.#controller.tick(this.#config.heartbeatActivity?.());
    if (event) {
      if (event.phase === "started") this.#startedSent = true;
      await this.#send(event);
    }
  }

  async #ensureStarted(): Promise<void> {
    if (this.#startedSent || this.#terminal) return;
    const event = this.#build("started", this.#config.title);
    this.#startedSent = true;
    await this.#send(event);
    this.#controller.onEmit(event);
  }

  async #emit(phase: ArcStatusPhase, title: string, opts: EmitOptions): Promise<void> {
    const event = this.#build(phase, title, opts);
    if (phase === "done") this.#terminal = true;
    await this.#send(event);
    this.#controller.onEmit(event);
  }

  #build(phase: ArcStatusPhase, title: string, opts: EmitOptions = {}): ArcStatusEvent {
    const event: ArcStatusEvent = {
      arc_id: this.arcId,
      phase,
      title,
      sent_at: new Date(this.#now()).toISOString(),
      protocol_version: this.#config.protocolVersion ?? PROTOCOL_VERSION,
    };
    if (this.#config.arcKind !== undefined) event.arc_kind = this.#config.arcKind;
    if (opts.body !== undefined) event.body = opts.body;
    if (opts.step !== undefined) event.step = opts.step;
    if (opts.total !== undefined) event.total = opts.total;
    if (opts.eta_minutes !== undefined) event.eta_minutes = opts.eta_minutes;
    return event;
  }

  async #send(event: ArcStatusEvent): Promise<void> {
    const result = validate(event);
    if (!result.ok) {
      this.#config.onError?.(
        new Error(`invalid arc.status event: ${JSON.stringify(result.issues)}`),
        event,
      );
      return;
    }
    try {
      await this.#config.transport.send(event);
    } catch (error) {
      this.#config.onError?.(error, event);
    }
  }

  #stop(): void {
    if (this.#handle !== null) {
      this.#timer.clearInterval(this.#handle);
      this.#handle = null;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorBody(error: unknown): string | undefined {
  return error instanceof Error && error.stack ? error.stack : undefined;
}
