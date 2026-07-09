import type { ArcStatusEvent } from "@agent-arc-status/reference";
import type { CliIO } from "./io.js";

/** Read the input source: a file path positional, or stdin for "-" / omitted. */
export async function readSource(positional: string[], io: CliIO): Promise<string> {
  const source = positional[0];
  if (source === undefined || source === "-") return io.readStdin();
  return io.readFile(source);
}

/** Group events by their arc_id, preserving first-seen order. */
export function groupByArc(events: ArcStatusEvent[]): Map<string, ArcStatusEvent[]> {
  const byArc = new Map<string, ArcStatusEvent[]>();
  for (const event of events) {
    const bucket = byArc.get(event.arc_id) ?? [];
    bucket.push(event);
    byArc.set(event.arc_id, bucket);
  }
  return byArc;
}
