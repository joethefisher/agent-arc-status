/**
 * @agent-arc-status/adapter-langchain — a LangChain callback handler that emits
 * arc.status events at human-meaningful boundaries: the root chain start becomes
 * `started`, agent actions become `milestone`s, the root chain end becomes
 * `done`, and an error becomes terminal `blocked`. Per-LLM/per-tool-call
 * callbacks are deliberately dropped — one-milestone-per-tool-call is an
 * anti-pattern (spec §5.3).
 *
 * Pass an instance in a LangChain `callbacks` array. The handler is duck-typed
 * to LangChain's callback methods so it needs no hard dependency on
 * `@langchain/core` (a peer).
 */

import type { ArcStatusEvent, ArcStatusPhase, EmitFn } from "@agent-arc-status/reference";

/** The subset of a LangChain agent action this handler reads. */
export interface AgentActionLike {
  tool?: string;
  log?: string;
}

export interface ArcStatusCallbackOptions {
  /** Where arc.status events are sent. */
  emit: EmitFn;
  /** Stable arc id for this run. */
  arcId: string;
  /** started title; defaults to "agent run". */
  title?: string;
  arcKind?: string;
  /** Injectable clock (epoch ms) for deterministic timestamps. */
  now?: () => number;
}

export class ArcStatusCallbackHandler {
  readonly name = "arc_status";
  readonly #options: ArcStatusCallbackOptions;
  #rootRunId: string | undefined;
  #startedEmitted = false;
  #terminal = false;

  constructor(options: ArcStatusCallbackOptions) {
    this.#options = options;
  }

  async handleChainStart(
    _chain: unknown,
    _inputs: unknown,
    runId: string,
    parentRunId?: string,
  ): Promise<void> {
    if (parentRunId === undefined && this.#rootRunId === undefined) {
      this.#rootRunId = runId;
      await this.#ensureStarted();
    }
  }

  async handleAgentAction(action: AgentActionLike, _runId?: string): Promise<void> {
    await this.#ensureStarted();
    const raw = action.tool ? `action: ${action.tool}` : (action.log?.split("\n")[0] ?? "agent action");
    await this.#emit("milestone", raw.slice(0, 200));
  }

  async handleChainEnd(_outputs: unknown, runId: string, _parentRunId?: string): Promise<void> {
    if (runId === this.#rootRunId && !this.#terminal) {
      this.#terminal = true;
      await this.#emit("done", "completed");
    }
  }

  async handleChainError(error: unknown, runId: string, _parentRunId?: string): Promise<void> {
    if (runId === this.#rootRunId && !this.#terminal) {
      this.#terminal = true;
      const message = error instanceof Error ? error.message : String(error);
      await this.#emit("blocked", `failed: ${message}`.slice(0, 200));
    }
  }

  async #ensureStarted(): Promise<void> {
    if (this.#startedEmitted) return;
    this.#startedEmitted = true;
    await this.#emit("started", this.#options.title ?? "agent run");
  }

  #emit(phase: ArcStatusPhase, title: string): void | Promise<void> {
    const event: ArcStatusEvent = {
      arc_id: this.#options.arcId,
      phase,
      title,
      sent_at: new Date(this.#options.now ? this.#options.now() : Date.now()).toISOString(),
    };
    if (this.#options.arcKind !== undefined) event.arc_kind = this.#options.arcKind;
    return this.#options.emit(event);
  }
}
