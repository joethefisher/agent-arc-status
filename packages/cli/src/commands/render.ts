import { parseJsonl, reduceArc, render } from "@agent-arc-status/reference";
import { color, PHASE_COLOR, supportsColor } from "../ansi.js";
import { parseArgs } from "../args.js";
import type { CliIO } from "../io.js";
import { groupByArc, readSource } from "../util.js";

export async function cmdRender(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv);

  let text: string;
  try {
    text = await readSource(args.positional, io);
  } catch (err) {
    io.stderr(`arc-status render: ${String(err)}\n`);
    return 3;
  }

  const { events, errors } = parseJsonl(text);

  if (args.flags["json"] === true) {
    const arcs = [...groupByArc(events).values()].map((evs) => reduceArc(evs));
    io.stdout(JSON.stringify({ arcs, errors }, null, 2) + "\n");
    return errors.length > 0 ? 1 : 0;
  }

  const enabled = supportsColor({
    isTty: io.isTty,
    env: io.env,
    noColorFlag: args.flags["no-color"] === true,
  });
  const withBody = args.flags["body"] === true;

  for (const event of events) {
    io.stdout(color(render(event, { body: withBody }), PHASE_COLOR[event.phase], enabled) + "\n");
  }
  for (const err of errors) {
    io.stderr(`line ${err.line}: ${err.issues.map((i) => i.message).join("; ")}\n`);
  }

  return errors.length > 0 ? 1 : 0;
}
