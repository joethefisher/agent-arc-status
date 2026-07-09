import { parseJsonl, validateSequence } from "@agent-arc-status/reference";
import { parseArgs } from "../args.js";
import type { CliIO } from "../io.js";
import { groupByArc, readSource } from "../util.js";

export async function cmdValidate(argv: string[], io: CliIO): Promise<number> {
  const args = parseArgs(argv);

  let text: string;
  try {
    text = await readSource(args.positional, io);
  } catch (err) {
    io.stderr(`arc-status validate: ${String(err)}\n`);
    return 3;
  }

  const { events, errors } = parseJsonl(text);
  const partial = args.flags["partial"] === true;
  const monotonic = args.flags["monotonic"] === true;

  const byArc = groupByArc(events);
  const sequenceIssues: Array<{ arcId: string; index: number; message: string }> = [];
  for (const [arcId, evs] of byArc) {
    const result = validateSequence(evs, { partial, checkMonotonicSentAt: monotonic });
    if (!result.ok) {
      for (const issue of result.issues) {
        sequenceIssues.push({ arcId, index: issue.index, message: issue.message });
      }
    }
  }

  const ok = errors.length === 0 && sequenceIssues.length === 0;

  if (args.flags["json"] === true) {
    io.stdout(JSON.stringify({ ok, parseErrors: errors, sequenceIssues }, null, 2) + "\n");
    return ok ? 0 : 1;
  }

  for (const err of errors) {
    io.stderr(`line ${err.line}: ${err.issues.map((i) => i.message).join("; ")}\n`);
  }
  for (const issue of sequenceIssues) {
    io.stderr(`arc ${issue.arcId} [#${issue.index}]: ${issue.message}\n`);
  }
  if (ok) {
    io.stdout(`ok: ${events.length} event(s) across ${byArc.size} arc(s) valid\n`);
  }

  return ok ? 0 : 1;
}
