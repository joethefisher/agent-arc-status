import type { ArcStatusEvent } from "@agent-arc-status/reference";
import type { Transport } from "../transport.js";

export interface StdoutTransportOptions {
  /** Sink for each JSON line. Default: `process.stdout.write`. */
  write?: (line: string) => void;
}

/** A JSON Lines transport (spec §8.3): one event per line to stdout. */
export function stdoutTransport(options: StdoutTransportOptions = {}): Transport {
  const write = options.write ?? ((line: string) => void process.stdout.write(line));
  return {
    async send(event: ArcStatusEvent): Promise<void> {
      write(JSON.stringify(event) + "\n");
    },
  };
}
