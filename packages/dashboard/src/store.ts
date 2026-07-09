import { reduceArc, type ArcState, type ArcStatusEvent } from "@agent-arc-status/reference";

/**
 * In-memory arc store, bounded so a long-lived dashboard cannot grow without
 * limit. Keeps the full event timeline per arc (cheap to fold) and evicts the
 * oldest arcs once the cap is reached.
 */
export class ArcStore {
  readonly #events = new Map<string, ArcStatusEvent[]>();
  #order: string[] = [];
  readonly #maxArcs: number;

  constructor(maxArcs = 200) {
    this.#maxArcs = maxArcs;
  }

  /** Append an event and return the arc's current reduced state. */
  append(event: ArcStatusEvent): ArcState {
    let bucket = this.#events.get(event.arc_id);
    if (bucket === undefined) {
      bucket = [];
      this.#events.set(event.arc_id, bucket);
      this.#order.push(event.arc_id);
      this.#evict();
    }
    bucket.push(event);
    return reduceArc(bucket) as ArcState;
  }

  /** Current reduced state for every tracked arc, in first-seen order. */
  snapshots(): ArcState[] {
    const out: ArcState[] = [];
    for (const arcId of this.#order) {
      const bucket = this.#events.get(arcId);
      if (bucket !== undefined) {
        const state = reduceArc(bucket);
        if (state !== null) out.push(state);
      }
    }
    return out;
  }

  #evict(): void {
    while (this.#order.length > this.#maxArcs) {
      const evicted = this.#order.shift();
      if (evicted !== undefined) this.#events.delete(evicted);
    }
  }
}
