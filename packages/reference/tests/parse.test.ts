import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, parseJsonl } from "../src/parse.js";
import { validateSequence } from "../src/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, "../../../examples");

const valid = JSON.stringify({
  arc_id: "00000000-0000-4000-8000-000000000001",
  phase: "started",
  title: "build Pulsefeed v0.1",
  sent_at: "2026-06-14T02:00:00.000Z",
});

describe("parse (single event JSON)", () => {
  it("parses and validates a well-formed event", () => {
    const r = parse(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.phase).toBe("started");
    }
  });

  it("returns an issue (not a throw) on malformed JSON", () => {
    const r = parse("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.message).toContain("not valid JSON");
    }
  });

  it("accepts a Buffer", () => {
    const r = parse(Buffer.from(valid, "utf8"));
    expect(r.ok).toBe(true);
  });
});

describe("parseJsonl (JSON Lines stream)", () => {
  it("parses multiple events", () => {
    const stream = `${valid}\n${valid}\n${valid}`;
    const r = parseJsonl(stream);
    expect(r.events.length).toBe(3);
    expect(r.errors.length).toBe(0);
  });

  it("skips empty lines", () => {
    const stream = `${valid}\n\n${valid}\n   \n`;
    const r = parseJsonl(stream);
    expect(r.events.length).toBe(2);
    expect(r.errors.length).toBe(0);
  });

  it("reports per-line errors without throwing", () => {
    const stream = `${valid}\n{bad json\n${valid}`;
    const r = parseJsonl(stream);
    expect(r.events.length).toBe(2);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]?.line).toBe(1);
  });

  it("handles CRLF line endings", () => {
    const stream = `${valid}\r\n${valid}\r\n`;
    const r = parseJsonl(stream);
    expect(r.events.length).toBe(2);
  });

  it("returns an empty result for empty input", () => {
    const r = parseJsonl("");
    expect(r.events.length).toBe(0);
    expect(r.errors.length).toBe(0);
  });
});

describe("end-to-end against shipped example fixtures", () => {
  for (const [file, expectedCount, validSequence] of [
    ["02-feature-build.jsonl", 6, true],
    ["03-long-autonomous.jsonl", 12, true],
    ["04-blocked-and-resumed.jsonl", 6, true],
    ["05-terminal-blocked.jsonl", 6, true],
  ] as const) {
    it(`${file}: parses, validates, sequence is conformant`, () => {
      const raw = readFileSync(resolve(examplesDir, file), "utf8");
      const r = parseJsonl(raw);
      expect(r.errors).toEqual([]);
      expect(r.events.length).toBe(expectedCount);
      const seq = validateSequence(r.events);
      expect(seq.ok, JSON.stringify(seq.issues)).toBe(validSequence);
    });
  }

  it("a truncated prefix fails as a complete arc but passes with partial:true", () => {
    const raw = readFileSync(resolve(examplesDir, "02-feature-build.jsonl"), "utf8");
    const { events } = parseJsonl(raw);
    const prefix = events.slice(0, -1); // drop the terminal `done`
    expect(validateSequence(prefix).ok).toBe(false);
    expect(validateSequence(prefix, { partial: true }).ok).toBe(true);
  });

  it("01-short-arc.jsonl: is intentionally empty (sub-cadence-floor arcs emit nothing)", () => {
    const raw = readFileSync(resolve(examplesDir, "01-short-arc.jsonl"), "utf8");
    const r = parseJsonl(raw);
    expect(r.events.length).toBe(0);
    expect(r.errors.length).toBe(0);
  });
});
