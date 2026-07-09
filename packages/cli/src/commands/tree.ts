import { parseJsonl, reduceArcForest, renderArcForest } from "@agent-arc-status/reference";
import { parseArgs } from "../args.js";
import type { CliIO } from "../io.js";
import { groupByArc, readSource } from "../util.js";

/**
 * Render a delegation tree grouped by the interim `x_parent_arc_id` convention.
 * Degrades to a flat list when no parent links are present.
 */
export async function cmdTree(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv);

  let text: string;
  try {
    text = await readSource(args.positional, io);
  } catch (err) {
    io.stderr(`arc-status tree: ${String(err)}\n`);
    return 3;
  }

  const { events } = parseJsonl(text);
  const forest = reduceArcForest(groupByArc(events));

  if (args.flags["json"] === true) {
    io.stdout(JSON.stringify(forest, null, 2) + "\n");
    return 0;
  }

  io.stdout(renderArcForest(forest) + "\n");
  return 0;
}
