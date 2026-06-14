/**
 * Parsing helpers for arc.status events.
 *
 * These wrap `JSON.parse` with structural validation. They never throw on
 * malformed input; they return a `ValidationResult`.
 */

import { validate, type ValidationResult } from "./validate.js";

/**
 * Parse a single JSON string or buffer into a validated event.
 */
export function parse(input: string | Buffer): ValidationResult {
  const text = typeof input === "string" ? input : input.toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          path: "",
          message: `not valid JSON: ${(err as Error).message}`,
        },
      ],
    };
  }

  return validate(parsed);
}

export interface JsonlParseResult {
  /** Validated events in order of appearance. */
  events: import("./types.js").ArcStatusEvent[];
  /** Per-line errors keyed by 0-indexed line number. */
  errors: Array<{
    line: number;
    issues: import("./validate.js").ValidationIssue[];
  }>;
}

/**
 * Parse a JSON Lines stream of events. Empty lines are skipped.
 *
 * Does not throw. Lines that fail to parse or validate are reported in
 * `errors`; valid lines are returned in `events`. Callers decide whether
 * to treat any error as fatal.
 */
export function parseJsonl(input: string | Buffer): JsonlParseResult {
  const text = typeof input === "string" ? input : input.toString("utf8");
  const lines = text.split(/\r?\n/);

  const events: import("./types.js").ArcStatusEvent[] = [];
  const errors: JsonlParseResult["errors"] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined || raw.trim() === "") continue;
    const result = parse(raw);
    if (result.ok) {
      events.push(result.event);
    } else {
      errors.push({ line: i, issues: result.issues });
    }
  }

  return { events, errors };
}
