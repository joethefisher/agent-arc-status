import type { ArcStatusEvent } from "@agent-arc-status/reference";

/**
 * A destination for validated arc.status events. Implementations own the wire
 * (HTTP, stdout, a queue). `send` MAY reject on network failure; the emitter
 * routes such rejections to its `onError` so status reporting never crashes the
 * workload.
 */
export interface Transport {
  send(event: ArcStatusEvent): Promise<void>;
  /** Optional cleanup, awaited when an emitter's `run()` finishes. */
  close?(): Promise<void>;
}
