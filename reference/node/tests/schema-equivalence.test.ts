/**
 * Proves the hand-rolled validator and the canonical JSON Schema agree.
 *
 * The hand-rolled validator is the runtime artifact; the schema is the
 * publishable artifact. If they ever disagree on what's valid, adopters
 * who validate against the schema get a different answer than adopters
 * who use this library. That's a bug.
 *
 * The one documented exception is the cross-field `step <= total` rule.
 * JSON Schema 2020-12 can't express it portably (see schema.json $comment),
 * so the schema permits step > total and the validator rejects it. This
 * test honors that exception explicitly.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { validate, RFC3339_PATTERN } from "../src/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../../spec/schema.json");
const examplesDir = resolve(here, "../../../examples");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
// Default-strict ajv, NO ajv-formats: this is the B4 regression guard. The
// published schema MUST compile under a stock validator with no plugins, so
// the timestamp grammar lives in a self-contained `pattern`, not a `format`.
const ajv = new Ajv2020({ allErrors: true });
const ajvValidate = ajv.compile(schema);

const baseValid = {
  arc_id: "00000000-0000-4000-8000-000000000001",
  phase: "started",
  title: "build Pulsefeed v0.1",
  sent_at: "2026-06-14T02:00:00.000Z",
};

interface Case {
  name: string;
  candidate: unknown;
  /**
   * When true, this case is a documented schema-vs-validator divergence
   * (the step > total rule). Schema accepts; validator rejects.
   */
  knownDivergence?: boolean;
}

const cases: Case[] = [
  { name: "minimal valid", candidate: baseValid },
  { name: "all phases — started", candidate: { ...baseValid, phase: "started" } },
  { name: "all phases — milestone", candidate: { ...baseValid, phase: "milestone" } },
  { name: "all phases — heartbeat", candidate: { ...baseValid, phase: "heartbeat" } },
  { name: "all phases — done", candidate: { ...baseValid, phase: "done" } },
  { name: "all phases — blocked", candidate: { ...baseValid, phase: "blocked" } },
  { name: "with step+total equal", candidate: { ...baseValid, step: 5, total: 5 } },
  { name: "with step < total", candidate: { ...baseValid, step: 2, total: 5 } },
  { name: "with eta_minutes zero", candidate: { ...baseValid, eta_minutes: 0 } },
  { name: "with eta_minutes large", candidate: { ...baseValid, eta_minutes: 240 } },
  { name: "with arc_kind", candidate: { ...baseValid, arc_kind: "build" } },
  { name: "with protocol_version 0.1", candidate: { ...baseValid, protocol_version: "0.1" } },
  { name: "with protocol_version 0.1.0", candidate: { ...baseValid, protocol_version: "0.1.0" } },
  { name: "with body markdown", candidate: { ...baseValid, body: "**details**" } },
  { name: "with x_ extension", candidate: { ...baseValid, x_app_correlation: "abc" } },

  // Invalid cases — schema and validator MUST both reject these.
  { name: "missing arc_id", candidate: { phase: "started", title: "x", sent_at: baseValid.sent_at } },
  { name: "missing phase", candidate: { ...baseValid, phase: undefined } },
  { name: "missing title", candidate: { ...baseValid, title: undefined } },
  { name: "missing sent_at", candidate: { ...baseValid, sent_at: undefined } },
  { name: "unknown phase", candidate: { ...baseValid, phase: "running" } },
  { name: "title too long", candidate: { ...baseValid, title: "x".repeat(501) } },
  { name: "non-string arc_id", candidate: { ...baseValid, arc_id: 42 } },
  { name: "negative eta_minutes", candidate: { ...baseValid, eta_minutes: -1 } },
  { name: "non-integer step", candidate: { ...baseValid, step: 1.5, total: 5 } },
  { name: "step zero", candidate: { ...baseValid, step: 0, total: 5 } },
  { name: "arc_kind too long", candidate: { ...baseValid, arc_kind: "x".repeat(65) } },
  { name: "malformed protocol_version", candidate: { ...baseValid, protocol_version: "draft1" } },
  { name: "body too long", candidate: { ...baseValid, body: "x".repeat(32001) } },
  { name: "title over 200", candidate: { ...baseValid, title: "x".repeat(201) } },
  { name: "title with newline", candidate: { ...baseValid, title: "line one\nline two" } },
  { name: "unknown non-x_ field", candidate: { ...baseValid, parent_arc_id: "a2" } },
  { name: "wrong-case X_ prefix field", candidate: { ...baseValid, X_FOO: "bar" } },

  // Documented divergence — schema permits step > total; validator rejects.
  { name: "step > total (documented divergence)", candidate: { ...baseValid, step: 6, total: 5 }, knownDivergence: true },

  // sent_at grammar — schema pattern and validator regex must agree.
  { name: "sent_at no fractional", candidate: { ...baseValid, sent_at: "2026-06-14T02:00:00Z" } },
  { name: "sent_at 9-digit fractional", candidate: { ...baseValid, sent_at: "2026-06-14T02:00:00.123456789Z" } },
  { name: "sent_at +00:00 offset", candidate: { ...baseValid, sent_at: "2026-06-14T02:00:00.000+00:00" } },
  { name: "sent_at -07:00 offset", candidate: { ...baseValid, sent_at: "2026-06-14T02:00:00.000-07:00" } },
  { name: "sent_at lowercase t/z", candidate: { ...baseValid, sent_at: "2026-06-14t02:00:00.000z" } },
  { name: "sent_at space separator", candidate: { ...baseValid, sent_at: "2026-06-14 02:00:00.000Z" } },
  { name: "sent_at leap second", candidate: { ...baseValid, sent_at: "2026-06-30T23:59:60Z" } },
  { name: "sent_at hour 24", candidate: { ...baseValid, sent_at: "2026-06-14T24:00:00Z" } },
  { name: "sent_at month 13", candidate: { ...baseValid, sent_at: "2026-13-01T00:00:00Z" } },
  { name: "sent_at offset > 14h", candidate: { ...baseValid, sent_at: "2026-06-14T02:00:00+15:00" } },

  // Documented divergence #2 — the schema pattern permits calendar-impossible
  // dates (a regex can't express per-month day limits); the validator rejects
  // them via a round-trip. Same contract discipline as step > total.
  { name: "sent_at Feb 30 (documented divergence)", candidate: { ...baseValid, sent_at: "2026-02-30T00:00:00Z" }, knownDivergence: true },
  { name: "sent_at Apr 31 (documented divergence)", candidate: { ...baseValid, sent_at: "2026-04-31T00:00:00Z" }, knownDivergence: true },
];

describe("schema-vs-validator equivalence", () => {
  for (const c of cases) {
    it(`agrees on: ${c.name}`, () => {
      // Strip undefined fields so ajv sees them as absent, matching the validator's view.
      const candidate = JSON.parse(JSON.stringify(c.candidate));
      const schemaOk = ajvValidate(candidate);
      const validatorOk = validate(candidate).ok;

      if (c.knownDivergence) {
        expect(schemaOk).toBe(true);
        expect(validatorOk).toBe(false);
      } else {
        expect(schemaOk, `ajv: ${JSON.stringify(ajvValidate.errors)}`).toBe(validatorOk);
      }
    });
  }
});

describe("schema pattern / validator regex drift guard", () => {
  it("sent_at.pattern in schema.json is byte-identical to the validator's RFC3339_PATTERN", () => {
    expect(schema.properties.sent_at.pattern).toBe(RFC3339_PATTERN);
  });
});

describe("shipped example fixtures pass the canonical JSON Schema", () => {
  for (const file of [
    "02-feature-build.jsonl",
    "03-long-autonomous.jsonl",
    "04-blocked-and-resumed.jsonl",
    "05-terminal-blocked.jsonl",
  ]) {
    it(`${file}: every event validates against schema.json`, () => {
      const raw = readFileSync(resolve(examplesDir, file), "utf8");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
      for (let i = 0; i < lines.length; i++) {
        const event = JSON.parse(lines[i]!);
        const ok = ajvValidate(event);
        expect(ok, `${file}:${i + 1} ${JSON.stringify(ajvValidate.errors)}`).toBe(true);
      }
    });
  }
});
