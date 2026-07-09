/**
 * arc-status — the Agent Arc Status Protocol CLI. `run(argv, io)` is the pure,
 * testable core; the bin is a thin wrapper. Exit codes: 0 ok, 1 invalid, 2
 * usage, 3 I/O.
 */

import { PROTOCOL_VERSION } from "@agent-arc-status/reference";
import type { CliIO } from "./io.js";
import { cmdRender } from "./commands/render.js";
import { cmdValidate } from "./commands/validate.js";
import { cmdTail } from "./commands/tail.js";
import { cmdServe } from "./commands/serve.js";
import { cmdTree } from "./commands/tree.js";

export { type CliIO, realIo } from "./io.js";

const HELP = `arc-status — Agent Arc Status Protocol CLI (protocol v${PROTOCOL_VERSION})

Usage:
  arc-status render   <file|->        Render a JSONL stream to human lines
  arc-status validate <file|->        Validate events + phase ordering (exit 1 on failure)
  arc-status tree     <file|->        Render arcs as a delegation tree (x_parent_arc_id)
  arc-status tail     <file> [--follow]  Render a file, optionally following appends
  arc-status serve    [--port 8787] [--host 127.0.0.1]  Receive webhook events and render live

Common flags:
  --json        Machine-readable output
  --body        Include event bodies (render)
  --partial     Validate an in-flight prefix (validate)
  --monotonic   Also require non-decreasing sent_at (validate)
  --no-color    Disable ANSI color (also honors NO_COLOR)

Examples:
  arc-status render examples/03-long-autonomous.jsonl
  cat events.jsonl | arc-status validate -
  arc-status serve --port 8787`;

export async function run(argv: string[], io: CliIO): Promise<number> {
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case "render":
      return cmdRender(rest, io);
    case "validate":
      return cmdValidate(rest, io);
    case "tree":
      return cmdTree(rest, io);
    case "tail":
      return cmdTail(rest, io);
    case "serve":
      return cmdServe(rest, io);
    case "version":
    case "--version":
    case "-v":
      io.stdout(`arc-status (protocol v${PROTOCOL_VERSION})\n`);
      return 0;
    case "help":
    case "--help":
    case "-h":
      io.stdout(HELP + "\n");
      return 0;
    case undefined:
      io.stderr(HELP + "\n");
      return 2;
    default:
      io.stderr(`arc-status: unknown command '${subcommand}'\n\n${HELP}\n`);
      return 2;
  }
}
