/**
 * Runtime validator for arc.status events.
 *
 * Mirrors the JSON Schema in `spec/schema.json` but is hand-rolled so the
 * reference implementation ships with zero runtime dependencies. For users
 * who want canonical-schema validation, `spec/schema.json` is also published
 * and works with any standard JSON Schema validator (e.g. ajv).
 */

import {
  ARC_STATUS_PHASES,
  type ArcStatusEvent,
  type ArcStatusPhase,
} from "./types.js";

export interface ValidationIssue {
  /** Dot-path to the offending field, e.g. "arc_id" or "step". */
  path: string;
  /** Human-readable explanation of the failure. */
  message: string;
}

export type ValidationResult =
  | { ok: true; event: ArcStatusEvent }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Canonical RFC 3339 grammar for `sent_at`, kept as a string so it can be
 * shared byte-for-byte with `spec/schema.json`'s `sent_at.pattern`. The
 * equivalence test asserts the two are identical, preventing future drift.
 *
 * It bounds month (01–12), day (01–31), hour (00–23), minute/second (00–59),
 * and the UTC offset (≤ ±14:00); fractional seconds are optional (1–9 digits).
 * It rejects leap seconds (`:60`), lowercase `t`/`z`, and the space separator.
 * Per-month calendar validity (e.g. Feb 30) cannot be expressed portably in a
 * regex and is enforced by `isValidCalendarDate` below.
 */
export const RFC3339_PATTERN =
  "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{1,9})?(Z|[+-](0\\d|1[0-4]):[0-5]\\d)$";

const RFC3339_RE = new RegExp(RFC3339_PATTERN);

const PROTOCOL_VERSION_RE = /^\d+\.\d+(\.\d+)?$/;

/**
 * The fields the Protocol defines. Any other key is a conformance violation
 * unless it is an `x_`-prefixed application extension (spec §3.2). Mirrors the
 * schema's `additionalProperties:false` + `patternProperties:{"^x_":{}}`.
 */
const KNOWN_KEYS = new Set([
  "arc_id",
  "phase",
  "title",
  "body",
  "step",
  "total",
  "eta_minutes",
  "sent_at",
  "arc_kind",
  "protocol_version",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPhase(value: unknown): value is ArcStatusPhase {
  return (
    typeof value === "string" &&
    (ARC_STATUS_PHASES as readonly string[]).includes(value)
  );
}

/**
 * The RFC 3339 grammar admits day 01–31 for every month; this rejects the
 * calendar-impossible combinations the regex cannot (e.g. 2026-02-30,
 * 2026-04-31) by round-tripping the date components through `Date.UTC` and
 * checking nothing rolled over (Feb 30 → Mar 2). Assumes the string already
 * matched `RFC3339_RE`, so the slices are well-formed.
 */
function isValidCalendarDate(ts: string): boolean {
  const year = Number(ts.slice(0, 4));
  const month = Number(ts.slice(5, 7));
  const day = Number(ts.slice(8, 10));
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day
  );
}

/**
 * Validate a candidate event against the Protocol's wire-format rules.
 *
 * This checks structural conformance only: required fields present, types
 * correct, enums respected, numeric bounds satisfied, timestamp parseable.
 *
 * It does NOT validate phase-ordering rules across a sequence of events;
 * see `validateSequence` for that.
 */
export function validate(candidate: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(candidate)) {
    return {
      ok: false,
      issues: [{ path: "", message: "event must be a JSON object" }],
    };
  }

  const e = candidate;

  // unknown fields: only x_-prefixed extensions are permitted (spec §3.2)
  for (const key of Object.keys(e)) {
    if (!KNOWN_KEYS.has(key) && !key.startsWith("x_")) {
      issues.push({
        path: key,
        message: "unknown field; only x_-prefixed extensions are permitted",
      });
    }
  }

  // arc_id
  if (typeof e.arc_id !== "string") {
    issues.push({ path: "arc_id", message: "must be a string" });
  } else if (e.arc_id.length < 1 || e.arc_id.length > 128) {
    issues.push({
      path: "arc_id",
      message: "must be between 1 and 128 characters",
    });
  }

  // phase
  if (!isPhase(e.phase)) {
    issues.push({
      path: "phase",
      message: `must be one of: ${ARC_STATUS_PHASES.join(", ")}`,
    });
  }

  // title
  if (typeof e.title !== "string") {
    issues.push({ path: "title", message: "must be a string" });
  } else if (e.title.length < 1 || e.title.length > 200) {
    issues.push({
      path: "title",
      message: "must be between 1 and 200 characters",
    });
  } else if (e.title.includes("\n")) {
    issues.push({
      path: "title",
      message: "should not contain newlines (use body for multi-line content)",
    });
  }

  // sent_at
  if (typeof e.sent_at !== "string") {
    issues.push({ path: "sent_at", message: "must be a string" });
  } else if (!RFC3339_RE.test(e.sent_at)) {
    issues.push({
      path: "sent_at",
      message:
        "must be an RFC 3339 timestamp (canonical: YYYY-MM-DDTHH:MM:SS[.fff]Z)",
    });
  } else if (!isValidCalendarDate(e.sent_at)) {
    issues.push({ path: "sent_at", message: "is not a valid calendar date" });
  }

  // body
  if (e.body !== undefined) {
    if (typeof e.body !== "string") {
      issues.push({ path: "body", message: "must be a string when present" });
    } else if (e.body.length > 32000) {
      issues.push({ path: "body", message: "must be ≤ 32000 characters" });
    }
  }

  // step
  if (e.step !== undefined) {
    if (typeof e.step !== "number" || !Number.isInteger(e.step) || e.step < 1) {
      issues.push({ path: "step", message: "must be an integer ≥ 1" });
    }
  }

  // total
  if (e.total !== undefined) {
    if (
      typeof e.total !== "number" ||
      !Number.isInteger(e.total) ||
      e.total < 1
    ) {
      issues.push({ path: "total", message: "must be an integer ≥ 1" });
    }
  }

  // step ≤ total
  if (
    typeof e.step === "number" &&
    typeof e.total === "number" &&
    Number.isInteger(e.step) &&
    Number.isInteger(e.total) &&
    e.step > e.total
  ) {
    issues.push({
      path: "step",
      message: "must be ≤ total when both are present",
    });
  }

  // eta_minutes
  if (e.eta_minutes !== undefined) {
    if (typeof e.eta_minutes !== "number" || e.eta_minutes < 0) {
      issues.push({
        path: "eta_minutes",
        message: "must be a number ≥ 0",
      });
    }
  }

  // arc_kind
  if (e.arc_kind !== undefined) {
    if (typeof e.arc_kind !== "string") {
      issues.push({ path: "arc_kind", message: "must be a string when present" });
    } else if (e.arc_kind.length > 64) {
      issues.push({ path: "arc_kind", message: "must be ≤ 64 characters" });
    }
  }

  // protocol_version
  if (e.protocol_version !== undefined) {
    if (typeof e.protocol_version !== "string") {
      issues.push({
        path: "protocol_version",
        message: "must be a string when present",
      });
    } else if (!PROTOCOL_VERSION_RE.test(e.protocol_version)) {
      issues.push({
        path: "protocol_version",
        message: "must match <major>.<minor>(.<patch>)?",
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, event: e as unknown as ArcStatusEvent };
}

export interface SequenceIssue {
  /** 0-indexed position in the input sequence where the violation was detected. */
  index: number;
  message: string;
}

export interface SequenceOptions {
  /**
   * Treat `events` as an in-flight prefix rather than a complete arc: skip the
   * requirement (§4.6) that the last event be a terminal (`done` or terminal
   * `blocked`). Use when validating a live stream that has not finished yet.
   * Default: false (the sequence is treated as a complete arc).
   */
  partial?: boolean;
  /**
   * Require `sent_at` to be non-decreasing across the sequence. Off by default:
   * lossy transports may deliver out of order and §7.5 has consumers reorder by
   * `sent_at`, so a raw stream is not guaranteed monotonic. Enable only when the
   * input is known to be in emission order.
   */
  checkMonotonicSentAt?: boolean;
}

/**
 * Validate phase-ordering for a sequence of events belonging to a single arc.
 *
 * Enforces §4.5–§4.6 of the spec:
 *   - exactly one `started`, at the beginning
 *   - the last event is a terminal (`done` or terminal `blocked`), unless
 *     `options.partial` is set (in-flight prefix)
 *   - at most one `done`, and no events after it
 *   - after `blocked`, the next event is `milestone` (resume), `done`, or
 *     end-of-arc; `started`, `heartbeat`, and a second consecutive `blocked`
 *     are illegal
 *   - (optional) `sent_at` is non-decreasing when `checkMonotonicSentAt` is set
 *
 * Does NOT re-validate individual events; call `validate` first if needed.
 */
export function validateSequence(
  events: ArcStatusEvent[],
  options: SequenceOptions = {},
): {
  ok: boolean;
  issues: SequenceIssue[];
} {
  const issues: SequenceIssue[] = [];

  if (events.length === 0) {
    return { ok: true, issues };
  }

  // arc_id consistency
  const arcId = events[0]?.arc_id;
  for (let i = 1; i < events.length; i++) {
    if (events[i]?.arc_id !== arcId) {
      issues.push({
        index: i,
        message: `arc_id mismatch: expected ${arcId}, got ${events[i]?.arc_id}`,
      });
    }
  }

  // first event must be started
  if (events[0]?.phase !== "started") {
    issues.push({
      index: 0,
      message: "first event in an arc must be phase=started",
    });
  }

  // exactly one started, exactly one done (or arc may terminate in blocked)
  let startedCount = 0;
  let doneCount = 0;
  let sawDoneAt: number | null = null;

  for (let i = 0; i < events.length; i++) {
    const phase = events[i]?.phase;
    if (phase === "started") startedCount++;
    if (phase === "done") {
      doneCount++;
      if (sawDoneAt === null) sawDoneAt = i;
    }
  }

  if (startedCount !== 1) {
    issues.push({
      index: 0,
      message: `arc must contain exactly one started event, found ${startedCount}`,
    });
  }

  if (doneCount > 1) {
    issues.push({
      index: 0,
      message: `arc must contain at most one done event, found ${doneCount}`,
    });
  }

  if (sawDoneAt !== null && sawDoneAt !== events.length - 1) {
    issues.push({
      index: sawDoneAt,
      message: "no events may follow a done event",
    });
  }

  // after blocked, next non-blocked phase must be milestone or done
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i]?.phase === "blocked") {
      const next = events[i + 1]?.phase;
      if (next === "started") {
        issues.push({
          index: i + 1,
          message: "started cannot follow blocked",
        });
      }
      if (next === "heartbeat") {
        issues.push({
          index: i + 1,
          message:
            "blocked must be followed by milestone (resume), done (resolve), or end-of-arc; heartbeat is not a legal resume signal",
        });
      }
      if (next === "blocked") {
        issues.push({
          index: i + 1,
          message:
            "consecutive blocked events are not allowed; emit a milestone (resume) before re-blocking (§4.5)",
        });
      }
    }
  }

  // last event must be a terminal for a complete arc (§4.6)
  if (!options.partial) {
    const lastPhase = events[events.length - 1]?.phase;
    if (lastPhase !== "done" && lastPhase !== "blocked") {
      issues.push({
        index: events.length - 1,
        message:
          "a complete arc must end in a terminal event (done or terminal blocked); pass { partial: true } to validate an in-flight prefix",
      });
    }
  }

  // optional: sent_at non-decreasing in emission order (off by default; §7.5)
  if (options.checkMonotonicSentAt) {
    for (let i = 1; i < events.length; i++) {
      const prev = Date.parse(events[i - 1]?.sent_at ?? "");
      const cur = Date.parse(events[i]?.sent_at ?? "");
      if (!Number.isNaN(prev) && !Number.isNaN(cur) && cur < prev) {
        issues.push({
          index: i,
          message:
            "sent_at decreased from the previous event; not allowed when checkMonotonicSentAt is set",
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
