import { createServer, type Server } from "node:http";
import {
  parse,
  render,
  SilenceWatchdog,
  type ArcStatusEvent,
} from "@agent-arc-status/reference";
import { color, PHASE_COLOR, supportsColor } from "../ansi.js";
import { parseArgs } from "../args.js";
import type { CliIO } from "../io.js";

export interface ServeOptions {
  maxBodyBytes?: number;
  colorEnabled?: boolean;
  /** Called with each validated event (used to feed a stall watchdog). */
  onEvent?: (event: ArcStatusEvent) => void;
}

/**
 * A zero-dependency webhook receiver that validates each POST and renders it to
 * `io.stdout`. Timer-free and does not listen — the caller owns the lifecycle,
 * which keeps it testable. Treats event content strictly as data (§9.4).
 */
export function createArcServer(io: CliIO, options: ServeOptions = {}): Server {
  const maxBody = options.maxBodyBytes ?? 65536;
  const enabled = options.colorEnabled ?? false;

  return createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBody) tooBig = true;
      else chunks.push(chunk);
    });
    req.on("error", () => {
      res.writeHead(400);
      res.end();
    });
    req.on("end", () => {
      if (tooBig) {
        res.writeHead(413);
        res.end();
        return;
      }
      const result = parse(Buffer.concat(chunks).toString("utf8"));
      if (!result.ok) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ issues: result.issues }));
        return;
      }
      const event = result.event;
      io.stdout(color(render(event), PHASE_COLOR[event.phase], enabled) + "\n");
      options.onEvent?.(event);
      res.writeHead(202);
      res.end();
    });
  });
}

export async function cmdServe(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv, new Set(["port", "host"]));
  const port = Number(args.flags["port"] ?? 8787);
  const host = String(args.flags["host"] ?? "127.0.0.1");
  const enabled = supportsColor({
    isTty: io.isTty,
    env: io.env,
    noColorFlag: args.flags["no-color"] === true,
  });

  const watchdog = new SilenceWatchdog({ now: io.now });
  const server = createArcServer(io, {
    colorEnabled: enabled,
    onEvent: (event) => watchdog.record(event.arc_id),
  });

  const interval = setInterval(() => {
    for (const stalled of watchdog.stalled()) {
      const secs = Math.round(stalled.silentMs / 1000);
      io.stdout(color(`⚠ stall: arc ${stalled.arc_id} silent ${secs}s`, 33, enabled) + "\n");
    }
  }, 30_000);
  (interval as { unref?: () => void }).unref?.();

  return await new Promise<number>((resolve) => {
    server.listen(port, host, () => {
      io.stderr(`arc-status serve listening on http://${host}:${port} (Ctrl-C to stop)\n`);
    });
    const stop = (): void => {
      clearInterval(interval);
      server.close(() => resolve(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
