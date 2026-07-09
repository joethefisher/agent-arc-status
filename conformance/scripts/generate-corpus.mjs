// Generates the language-agnostic conformance corpus under conformance/.
//
// The corpus is checked in as static JSON so any implementation can consume it
// without running this script. This generator exists only to (re)produce the
// files deterministically and to keep exact-length boundary strings honest
// (e.g. a 201-char title) instead of hand-counting them.
//
// IMPORTANT: expected verdicts (schema_valid / validator_valid / sequence_valid)
// are declared here by SPEC INTENT — never by calling the reference validator.
// The runners independently check the reference against these declared verdicts,
// so agreement is a real signal, not a tautology.
//
// Usage: node conformance/scripts/generate-corpus.mjs

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const conformanceDir = resolve(here, "..");
const repoRoot = resolve(conformanceDir, "..");
const examplesDir = resolve(repoRoot, "examples");

const ARC = "018f9c31-7e40-7a2b-9c00-0000000000a1";
const ARC2 = "018f9c31-7e40-7a2b-9c00-0000000000b2";
const TS = "2026-06-14T09:00:00Z";

/** Build an event, defaulting the four required fields. */
function ev(over = {}) {
  return { arc_id: ARC, phase: "started", title: "build atlas index", sent_at: TS, ...over };
}

// ---------------------------------------------------------------------------
// Single-event cases. tier is always machine-verifiable (schema + field rules).
// ---------------------------------------------------------------------------

const validEvents = [
  ["minimal-required-only", "only the four required fields", ev()],
  ["milestone-step-total", "milestone carrying step/total", ev({ phase: "milestone", title: "routing table shipped", step: 3, total: 8 })],
  ["heartbeat", "heartbeat with a current-activity title", ev({ phase: "heartbeat", title: "still working: parameter sweep" })],
  ["done", "terminal done", ev({ phase: "done", title: "complete, 43 tests, deployed" })],
  ["blocked-with-body", "blocked carrying an explanatory body", ev({ phase: "blocked", title: "need infra sign-off", body: "waiting on the platform team to approve the new route" })],
  ["eta-zero", "eta_minutes may be zero", ev({ phase: "milestone", title: "final checks", eta_minutes: 0 })],
  ["eta-fractional", "eta_minutes may be fractional", ev({ phase: "milestone", title: "compiling", eta_minutes: 12.5 })],
  ["arc-kind", "optional arc_kind label", ev({ arc_kind: "build" })],
  ["protocol-version-major-minor", "protocol_version as major.minor", ev({ protocol_version: "0.2" })],
  ["protocol-version-with-patch", "protocol_version as major.minor.patch", ev({ protocol_version: "0.2.0" })],
  ["x-extensions", "x_-prefixed extensions are permitted", ev({ x_trace_id: "abc123", x_parent_arc_id: ARC2 })],
  ["sent-at-fractional-seconds", "sent_at with fractional seconds", ev({ sent_at: "2026-06-14T09:00:00.250Z" })],
  ["sent-at-numeric-offset", "sent_at with a numeric UTC offset", ev({ sent_at: "2026-06-14T02:00:00-07:00" })],
].map(([slug, description, event]) => ({
  id: `single-event/valid/${slug}`,
  description,
  event,
  schema_valid: true,
  validator_valid: true,
  tier: "machine-verifiable",
  category: "schema-validity",
}));

const schemaInvalid = [
  ["not-object-null", "a null is not an object", null, ""],
  ["not-object-array", "an array is not an object", [], ""],
  ["not-object-string", "a string is not an object", "build atlas index", ""],
  ["not-object-number", "a number is not an object", 42, ""],
  ["missing-arc_id", "arc_id is required", { phase: "started", title: "x", sent_at: TS }, "arc_id"],
  ["missing-phase", "phase is required", { arc_id: ARC, title: "x", sent_at: TS }, "phase"],
  ["missing-title", "title is required", { arc_id: ARC, phase: "started", sent_at: TS }, "title"],
  ["missing-sent_at", "sent_at is required", { arc_id: ARC, phase: "started", title: "x" }, "sent_at"],
  ["arc_id-wrong-type", "arc_id must be a string", ev({ arc_id: 123 }), "arc_id"],
  ["phase-not-in-enum", "phase must be one of the five", ev({ phase: "planning" }), "phase"],
  ["phase-wrong-case", "phase is case-sensitive", ev({ phase: "Started" }), "phase"],
  ["title-newline", "title must not contain a newline", ev({ title: "line one\nline two" }), "title"],
  ["body-wrong-type", "body must be a string when present", ev({ body: 123 }), "body"],
].map(([slug, description, event, path]) => ({
  id: `single-event/schema-invalid/${slug}`,
  description,
  event,
  schema_valid: false,
  validator_valid: false,
  tier: "machine-verifiable",
  category: "schema-validity",
  ...(path ? { issue_path: path } : {}),
}));

const fieldConstraints = [
  ["arc_id-empty", "arc_id below minLength 1", ev({ arc_id: "" }), "arc_id"],
  ["arc_id-too-long", "arc_id above maxLength 128", ev({ arc_id: "a".repeat(129) }), "arc_id"],
  ["title-empty", "title below minLength 1", ev({ title: "" }), "title"],
  ["title-too-long", "title above maxLength 200", ev({ title: "x".repeat(201) }), "title"],
  ["step-zero", "step below minimum 1", ev({ phase: "milestone", step: 0, total: 5 }), "step"],
  ["step-non-integer", "step must be an integer", ev({ phase: "milestone", step: 1.5, total: 5 }), "step"],
  ["total-zero", "total below minimum 1", ev({ phase: "milestone", step: 1, total: 0 }), "total"],
  ["eta-negative", "eta_minutes below minimum 0", ev({ eta_minutes: -1 }), "eta_minutes"],
  ["arc_kind-too-long", "arc_kind above maxLength 64", ev({ arc_kind: "k".repeat(65) }), "arc_kind"],
  ["body-too-long", "body above maxLength 32000", ev({ body: "z".repeat(32001) }), "body"],
  ["protocol-version-malformed", "protocol_version must be numeric major.minor(.patch)", ev({ protocol_version: "0.2.0.1" }), "protocol_version"],
  ["sent-at-space-separator", "sent_at must use T, not a space", ev({ sent_at: "2026-06-14 09:00:00Z" }), "sent_at"],
  ["sent-at-lowercase-t", "sent_at T must be uppercase", ev({ sent_at: "2026-06-14t09:00:00Z" }), "sent_at"],
  ["sent-at-leap-second", "sent_at must not use a leap second", ev({ sent_at: "2026-06-14T23:59:60Z" }), "sent_at"],
  ["sent-at-offset-too-large", "sent_at offset must be <= +/-14:00", ev({ sent_at: "2026-06-14T09:00:00+15:00" }), "sent_at"],
].map(([slug, description, event, path]) => ({
  id: `single-event/field-constraints/${slug}`,
  description,
  event,
  schema_valid: false,
  validator_valid: false,
  tier: "machine-verifiable",
  category: "field-constraints",
  issue_path: path,
}));

const extensions = [
  {
    id: "single-event/extensions/single-x-field",
    description: "one x_-prefixed extension is accepted",
    event: ev({ x_trace: "t" }),
    schema_valid: true,
    validator_valid: true,
    tier: "machine-verifiable",
    category: "extensions",
  },
  {
    id: "single-event/extensions/multiple-x-fields",
    description: "several x_-prefixed extensions are accepted",
    event: ev({ x_a: "1", x_b: 2, x_parent_arc_id: ARC2 }),
    schema_valid: true,
    validator_valid: true,
    tier: "machine-verifiable",
    category: "extensions",
  },
  {
    id: "single-event/extensions/unknown-non-x-field",
    description: "an unknown field without the x_ prefix is rejected",
    event: ev({ foo: "bar" }),
    schema_valid: false,
    validator_valid: false,
    tier: "machine-verifiable",
    category: "extensions",
    issue_path: "foo",
  },
  {
    id: "single-event/extensions/wrong-case-prefix",
    description: "the extension prefix is case-sensitive (X_ is not x_)",
    event: ev({ X_trace: "t" }),
    schema_valid: false,
    validator_valid: false,
    tier: "machine-verifiable",
    category: "extensions",
    issue_path: "X_trace",
  },
];

// The two documented divergences: the schema (a regex + structural check)
// ACCEPTS these, but the full validator REJECTS them. A schema-only
// implementation is conformant if it agrees with schema_valid; a full
// implementation must additionally agree with validator_valid.
const divergences = [
  {
    id: "single-event/divergences/step-greater-than-total",
    description: "step > total: JSON Schema 2020-12 cannot express this cross-field rule",
    event: ev({ phase: "milestone", step: 5, total: 3 }),
    schema_valid: true,
    validator_valid: false,
    tier: "machine-verifiable",
    category: "divergence",
    issue_path: "step",
    notes: "Documented divergence #1 (schema.json $comment).",
  },
  {
    id: "single-event/divergences/sent-at-feb-30",
    description: "2026-02-30 is calendar-impossible; the regex admits it, the validator rejects it",
    event: ev({ sent_at: "2026-02-30T09:00:00Z" }),
    schema_valid: true,
    validator_valid: false,
    tier: "machine-verifiable",
    category: "divergence",
    issue_path: "sent_at",
    notes: "Documented divergence #2 (schema.json $comment).",
  },
  {
    id: "single-event/divergences/sent-at-apr-31",
    description: "2026-04-31 is calendar-impossible; the regex admits it, the validator rejects it",
    event: ev({ sent_at: "2026-04-31T09:00:00Z" }),
    schema_valid: true,
    validator_valid: false,
    tier: "machine-verifiable",
    category: "divergence",
    issue_path: "sent_at",
    notes: "Documented divergence #2 (schema.json $comment).",
  },
];

// ---------------------------------------------------------------------------
// Sequence cases. tier is machine-verifiable (phase legality, §4.5–§4.6).
// ---------------------------------------------------------------------------

let seqClock = Date.UTC(2026, 5, 14, 9, 0, 0);
/** Sequential event with an auto-incrementing sent_at (5 min apart). */
function sev(over = {}) {
  const sent_at = new Date(seqClock).toISOString().replace(".000Z", "Z");
  seqClock += 5 * 60_000;
  return { arc_id: ARC, phase: "milestone", title: "step", sent_at, ...over };
}
function seqReset() {
  seqClock = Date.UTC(2026, 5, 14, 9, 0, 0);
}

function started(over) { return sev({ phase: "started", title: "build atlas index", ...over }); }
function milestone(over) { return sev({ phase: "milestone", title: "progress", ...over }); }
function heartbeat(over) { return sev({ phase: "heartbeat", title: "still working", ...over }); }
function blocked(over) { return sev({ phase: "blocked", title: "blocked on review", ...over }); }
function done(over) { return sev({ phase: "done", title: "complete", ...over }); }

function seqCase(id, description, events, extra = {}) {
  seqReset();
  return {
    id: `sequence/${id}`,
    description,
    events: typeof events === "function" ? events() : events,
    tier: "machine-verifiable",
    category: "phase-legality",
    ...extra,
  };
}

const sequenceValid = [
  seqCase("valid/started-done", "minimal complete arc", () => [started(), done()], { sequence_valid: true }),
  seqCase("valid/started-milestone-done", "one milestone between start and done", () => [started(), milestone(), done()], { sequence_valid: true }),
  seqCase("valid/started-milestone-heartbeat-milestone-done", "heartbeats interleave with milestones", () => [started(), milestone(), heartbeat(), milestone(), done()], { sequence_valid: true }),
  seqCase("valid/blocked-then-resumed", "blocked resolves via a milestone then done", () => [started(), blocked(), milestone({ title: "unblocked" }), done()], { sequence_valid: true }),
  seqCase("valid/terminal-blocked", "an arc may legitimately end in blocked", () => [started(), blocked()], { sequence_valid: true }),
  seqCase("valid/terminal-blocked-with-heartbeats", "active investigation heartbeats then ends blocked", () => [started(), heartbeat(), milestone(), heartbeat(), blocked()], { sequence_valid: true }),
  seqCase("valid/blocked-then-done", "blocked resolves directly to done", () => [started(), blocked(), done()], { sequence_valid: true }),
  seqCase("valid/empty", "an empty sequence is vacuously valid", [], { sequence_valid: true }),
  {
    id: "sequence/valid/out-of-order-sent-at-tolerated",
    description: "by default sent_at order is not enforced (§7.5)",
    events: [
      { arc_id: ARC, phase: "started", title: "build", sent_at: "2026-06-14T09:00:00Z" },
      { arc_id: ARC, phase: "milestone", title: "progress", sent_at: "2026-06-14T08:55:00Z" },
      { arc_id: ARC, phase: "done", title: "complete", sent_at: "2026-06-14T09:10:00Z" },
    ],
    tier: "machine-verifiable",
    category: "phase-legality",
    sequence_valid: true,
  },
];

const sequencePhaseOrdering = [
  seqCase("phase-ordering/not-started-first", "the first event must be started", () => [milestone()], { sequence_valid: false, issue: "not-started-first", issue_index: 0 }),
  seqCase("phase-ordering/first-is-done", "an arc cannot open with done", () => [done()], { sequence_valid: false, issue: "not-started-first", issue_index: 0 }),
  seqCase("phase-ordering/two-started", "exactly one started per arc", () => [started(), started(), done()], { sequence_valid: false, issue: "multiple-started" }),
  seqCase("phase-ordering/two-done", "at most one done per arc", () => [started(), done(), done()], { sequence_valid: false, issue: "multiple-done" }),
  seqCase("phase-ordering/no-terminal", "a complete arc must end in a terminal event", () => [started(), milestone()], { sequence_valid: false, issue: "no-terminal", issue_index: 1 }),
  seqCase("phase-ordering/event-after-done", "no events may follow done", () => [started(), done(), milestone()], { sequence_valid: false, issue: "event-after-done" }),
  {
    id: "sequence/phase-ordering/arc-id-mismatch",
    description: "all events in an arc must share one arc_id",
    events: [
      { arc_id: ARC, phase: "started", title: "build", sent_at: "2026-06-14T09:00:00Z" },
      { arc_id: ARC2, phase: "milestone", title: "progress", sent_at: "2026-06-14T09:05:00Z" },
      { arc_id: ARC, phase: "done", title: "complete", sent_at: "2026-06-14T09:10:00Z" },
    ],
    tier: "machine-verifiable",
    category: "phase-legality",
    sequence_valid: false,
    issue: "arc-id-mismatch",
    issue_index: 1,
  },
];

const sequenceBlockedRules = [
  seqCase("blocked-rules/consecutive-blocked", "two blocked events cannot be adjacent (§4.5)", () => [started(), blocked(), blocked()], { sequence_valid: false, issue: "consecutive-blocked", issue_index: 2 }),
  seqCase("blocked-rules/heartbeat-after-blocked", "heartbeat is not a legal resume signal", () => [started(), blocked(), heartbeat(), done()], { sequence_valid: false, issue: "heartbeat-after-blocked", issue_index: 2 }),
  seqCase("blocked-rules/started-after-blocked", "started cannot follow blocked", () => [started(), blocked(), started(), done()], { sequence_valid: false, issue: "started-after-blocked" }),
];

const sequenceOptions = [
  seqCase("options/partial-prefix-valid", "an in-flight prefix is valid with { partial: true }", () => [started(), milestone(), heartbeat()], { sequence_valid: true, options: { partial: true } }),
  {
    id: "sequence/options/monotonic-violation",
    description: "with checkMonotonicSentAt, a decreasing sent_at is rejected",
    events: [
      { arc_id: ARC, phase: "started", title: "build", sent_at: "2026-06-14T09:00:00Z" },
      { arc_id: ARC, phase: "milestone", title: "progress", sent_at: "2026-06-14T08:55:00Z" },
      { arc_id: ARC, phase: "done", title: "complete", sent_at: "2026-06-14T09:10:00Z" },
    ],
    tier: "machine-verifiable",
    category: "phase-legality",
    options: { checkMonotonicSentAt: true },
    sequence_valid: false,
    issue: "sent-at-decreased",
    issue_index: 1,
  },
];

// ---------------------------------------------------------------------------
// Example streams (the five canonical files) as valid sequence cases.
// ---------------------------------------------------------------------------

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

const exampleCases = readdirSync(examplesDir)
  .filter((f) => f.endsWith(".jsonl"))
  .sort()
  .map((f) => {
    const events = parseJsonl(readFileSync(resolve(examplesDir, f), "utf8"));
    return {
      id: `examples/${f.replace(/\.jsonl$/, "")}`,
      description: `canonical example stream ${f}`,
      events,
      tier: "machine-verifiable",
      category: "phase-legality",
      sequence_valid: true,
    };
  });

// ---------------------------------------------------------------------------
// Write files + manifest.
// ---------------------------------------------------------------------------

const files = {
  "single-event/valid.json": validEvents,
  "single-event/schema-invalid.json": schemaInvalid,
  "single-event/field-constraints.json": fieldConstraints,
  "single-event/extensions.json": extensions,
  "single-event/divergences.json": divergences,
  "sequence/valid.json": sequenceValid,
  "sequence/phase-ordering.json": sequencePhaseOrdering,
  "sequence/blocked-rules.json": sequenceBlockedRules,
  "sequence/options.json": sequenceOptions,
  "examples/streams.json": exampleCases,
};

const manifestFiles = [];
let totalCases = 0;

for (const [rel, cases] of Object.entries(files)) {
  const abs = resolve(conformanceDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const json = JSON.stringify(cases, null, 2) + "\n";
  writeFileSync(abs, json);
  const sha256 = createHash("sha256").update(json).digest("hex");
  manifestFiles.push({ file: rel, cases: cases.length, sha256 });
  totalCases += cases.length;
}

const schema = JSON.parse(readFileSync(resolve(repoRoot, "spec/schema.json"), "utf8"));

const manifest = {
  conformance_version: "1.0.0",
  protocol_version: "0.2",
  schema_id: schema.$id,
  description:
    "Language-agnostic conformance corpus for the Agent Arc Status Protocol. Each case declares expected verdicts (schema_valid / validator_valid / sequence_valid) that any implementation's runner checks against its own validator. See README.md for the §6 tier coverage.",
  total_cases: totalCases,
  files: manifestFiles,
};

writeFileSync(
  resolve(conformanceDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log(`Wrote ${manifestFiles.length} corpus files, ${totalCases} cases total.`);
for (const f of manifestFiles) console.log(`  ${f.file}: ${f.cases}`);
console.log(`Repo-relative corpus dir: ${relative(repoRoot, conformanceDir)}`);
