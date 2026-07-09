import { watch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { parseJsonl, render } from "@agent-arc-status/reference";
import { color, PHASE_COLOR, supportsColor } from "../ansi.js";
import { parseArgs } from "../args.js";
import type { CliIO } from "../io.js";

/**
 * Render a JSONL file, then (with `--follow`) re-render appended events as the
 * file grows, reading only the delta. Handles truncation by resetting the
 * offset. `--follow` runs until interrupted.
 */
export async function cmdTail(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv);
  const file = args.positional[0];
  if (file === undefined || file === "-") {
    io.stderr("arc-status tail: a file path is required\n");
    return 2;
  }

  const enabled = supportsColor({
    isTty: io.isTty,
    env: io.env,
    noColorFlag: args.flags["no-color"] === true,
  });
  const renderText = (text: string): void => {
    for (const event of parseJsonl(text).events) {
      io.stdout(color(render(event), PHASE_COLOR[event.phase], enabled) + "\n");
    }
  };

  let text: string;
  try {
    text = await io.readFile(file);
  } catch (err) {
    io.stderr(`arc-status tail: ${String(err)}\n`);
    return 3;
  }
  renderText(text);

  if (args.flags["follow"] !== true) return 0;

  let offset = Buffer.byteLength(text, "utf8");
  return await new Promise<number>((resolve) => {
    const watcher = watch(file, () => {
      void (async () => {
        try {
          const info = await stat(file);
          if (info.size < offset) offset = 0; // truncated/rotated
          if (info.size > offset) {
            const handle = await open(file, "r");
            const buffer = Buffer.alloc(info.size - offset);
            await handle.read(buffer, 0, buffer.length, offset);
            await handle.close();
            offset = info.size;
            renderText(buffer.toString("utf8"));
          }
        } catch {
          /* transient fs error; keep watching */
        }
      })();
    });
    const stop = (): void => {
      watcher.close();
      resolve(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
