import { describe, it, expect } from "vitest";
import { validate, validateSequence } from "../src/validate.js";
import type { ArcStatusEvent } from "../src/types.js";

const minimal = (): ArcStatusEvent => ({
  arc_id: "00000000-0000-4000-8000-000000000001",
  phase: "started",
  title: "build Pulsefeed v0.1",
  sent_at: "2026-06-14T02:00:00.000Z",
});

describe("validate (single event)", () => {
  it("accepts a minimal valid event", () => {
    const r = validate(minimal());
    expect(r.ok).toBe(true);
  });

  it("rejects a non-object", () => {
    const r = validate("not an object");
    expect(r.ok).toBe(false);
  });

  it("rejects null", () => {
    const r = validate(null);
    expect(r.ok).toBe(false);
  });

  it("rejects an array (must be an object)", () => {
    const r = validate([]);
    expect(r.ok).toBe(false);
  });

  it("requires arc_id", () => {
    const e = { ...minimal() } as Partial<ArcStatusEvent>;
    delete e.arc_id;
    const r = validate(e);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === "arc_id")).toBe(true);
    }
  });

  it("requires phase", () => {
    const e = { ...minimal() } as Partial<ArcStatusEvent>;
    delete e.phase;
    const r = validate(e);
    expect(r.ok).toBe(false);
  });

  it("requires title", () => {
    const e = { ...minimal() } as Partial<ArcStatusEvent>;
    delete e.title;
    const r = validate(e);
    expect(r.ok).toBe(false);
  });

  it("requires sent_at", () => {
    const e = { ...minimal() } as Partial<ArcStatusEvent>;
    delete e.sent_at;
    const r = validate(e);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown phase", () => {
    const r = validate({ ...minimal(), phase: "running" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === "phase")).toBe(true);
    }
  });

  it("accepts each valid phase", () => {
    for (const phase of ["started", "milestone", "heartbeat", "done", "blocked"]) {
      const r = validate({ ...minimal(), phase });
      expect(r.ok, `phase=${phase}`).toBe(true);
    }
  });

  it("rejects a title with newlines", () => {
    const r = validate({ ...minimal(), title: "line one\nline two" });
    expect(r.ok).toBe(false);
  });

  it("accepts a title of exactly 200 chars", () => {
    const r = validate({ ...minimal(), title: "x".repeat(200) });
    expect(r.ok).toBe(true);
  });

  it("rejects a title over the 200-char cap", () => {
    const r = validate({ ...minimal(), title: "x".repeat(201) });
    expect(r.ok).toBe(false);
  });

  it("rejects an arc_id over 128 chars", () => {
    const r = validate({ ...minimal(), arc_id: "x".repeat(129) });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-RFC3339 sent_at", () => {
    const r = validate({ ...minimal(), sent_at: "yesterday" });
    expect(r.ok).toBe(false);
  });

  it("accepts a sent_at with timezone offset", () => {
    const r = validate({ ...minimal(), sent_at: "2026-06-14T02:00:00.000-07:00" });
    expect(r.ok).toBe(true);
  });

  it("accepts a sent_at without fractional seconds", () => {
    const r = validate({ ...minimal(), sent_at: "2026-06-14T02:00:00Z" });
    expect(r.ok).toBe(true);
  });

  it("rejects an impossible calendar date (Feb 30)", () => {
    const r = validate({ ...minimal(), sent_at: "2026-02-30T00:00:00Z" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === "sent_at")).toBe(true);
    }
  });

  it("rejects an impossible calendar date (Apr 31)", () => {
    const r = validate({ ...minimal(), sent_at: "2026-04-31T00:00:00Z" });
    expect(r.ok).toBe(false);
  });

  it("rejects a UTC offset greater than 14 hours", () => {
    const r = validate({ ...minimal(), sent_at: "2026-06-14T02:00:00+15:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects a lowercase t/z timestamp (non-canonical)", () => {
    const r = validate({ ...minimal(), sent_at: "2026-06-14t02:00:00.000z" });
    expect(r.ok).toBe(false);
  });

  it("rejects a leap second", () => {
    const r = validate({ ...minimal(), sent_at: "2026-06-30T23:59:60Z" });
    expect(r.ok).toBe(false);
  });

  it("rejects step < 1", () => {
    const r = validate({ ...minimal(), step: 0, total: 5 });
    expect(r.ok).toBe(false);
  });

  it("rejects non-integer step", () => {
    const r = validate({ ...minimal(), step: 1.5, total: 5 });
    expect(r.ok).toBe(false);
  });

  it("rejects step > total", () => {
    const r = validate({ ...minimal(), step: 6, total: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === "step")).toBe(true);
    }
  });

  it("accepts step == total", () => {
    const r = validate({ ...minimal(), step: 5, total: 5 });
    expect(r.ok).toBe(true);
  });

  it("rejects negative eta_minutes", () => {
    const r = validate({ ...minimal(), eta_minutes: -1 });
    expect(r.ok).toBe(false);
  });

  it("accepts eta_minutes of 0", () => {
    const r = validate({ ...minimal(), eta_minutes: 0 });
    expect(r.ok).toBe(true);
  });

  it("rejects an arc_kind over 64 chars", () => {
    const r = validate({ ...minimal(), arc_kind: "x".repeat(65) });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed protocol_version", () => {
    const r = validate({ ...minimal(), protocol_version: "draft1" });
    expect(r.ok).toBe(false);
  });

  it("accepts protocol_version like 0.1", () => {
    const r = validate({ ...minimal(), protocol_version: "0.1" });
    expect(r.ok).toBe(true);
  });

  it("accepts protocol_version like 0.1.0", () => {
    const r = validate({ ...minimal(), protocol_version: "0.1.0" });
    expect(r.ok).toBe(true);
  });

  it("rejects body over 32000 chars", () => {
    const r = validate({ ...minimal(), body: "x".repeat(32001) });
    expect(r.ok).toBe(false);
  });

  it("tolerates unknown x_-prefixed extensions", () => {
    const r = validate({ ...minimal(), x_correlation_id: "abc-123" });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown non-x_ field", () => {
    const r = validate({ ...minimal(), parent_arc_id: "a2" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === "parent_arc_id")).toBe(true);
    }
  });

  it("rejects a wrong-case X_-prefixed field (case-sensitive namespace)", () => {
    const r = validate({ ...minimal(), X_FOO: "bar" });
    expect(r.ok).toBe(false);
  });

  it("returns multiple issues when multiple fields are wrong", () => {
    const r = validate({
      arc_id: 42,
      phase: "running",
      title: "",
      sent_at: "nope",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("validateSequence (phase ordering per spec §4.6)", () => {
  const at = (offset: number) =>
    new Date(Date.UTC(2026, 5, 14, 2, offset)).toISOString();

  it("accepts an empty sequence", () => {
    const r = validateSequence([]);
    expect(r.ok).toBe(true);
  });

  it("accepts started → milestone → done", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "milestone", title: "step", sent_at: at(10) },
      { arc_id, phase: "done", title: "complete", sent_at: at(20) },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects sequence not starting with started", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "milestone", title: "step", sent_at: at(0) },
      { arc_id, phase: "done", title: "complete", sent_at: at(10) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects two started events", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "started", title: "again", sent_at: at(5) },
      { arc_id, phase: "done", title: "complete", sent_at: at(10) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects two done events", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "done", title: "first done", sent_at: at(10) },
      { arc_id, phase: "done", title: "again", sent_at: at(20) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects events after done", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "done", title: "done", sent_at: at(10) },
      { arc_id, phase: "milestone", title: "after?", sent_at: at(20) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects arc_id drift mid-sequence", () => {
    const r = validateSequence([
      { arc_id: "a1", phase: "started", title: "start", sent_at: at(0) },
      { arc_id: "a2", phase: "done", title: "wrong arc", sent_at: at(10) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("accepts blocked → milestone → done", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "blocked", title: "waiting", sent_at: at(5) },
      { arc_id, phase: "milestone", title: "resumed", sent_at: at(60) },
      { arc_id, phase: "done", title: "done", sent_at: at(70) },
    ]);
    expect(r.ok).toBe(true);
  });

  it("accepts an arc ending in terminal blocked (no done)", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "milestone", title: "step", sent_at: at(10) },
      { arc_id, phase: "blocked", title: "terminal", sent_at: at(20) },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects heartbeat as the legal resume after blocked", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "blocked", title: "waiting", sent_at: at(5) },
      { arc_id, phase: "heartbeat", title: "still waiting", sent_at: at(30) },
    ]);
    expect(r.ok).toBe(false);
  });

  // §4.6: a complete arc must end in a terminal event (done | terminal blocked).

  it("rejects an arc that ends in milestone (no terminal)", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "milestone", title: "step", sent_at: at(10) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects an arc that ends in heartbeat (no terminal)", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "heartbeat", title: "still working", sent_at: at(10) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a lone started arc (never reaches a terminal)", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("accepts an in-flight prefix when partial:true", () => {
    const arc_id = "a1";
    const r = validateSequence(
      [
        { arc_id, phase: "started", title: "start", sent_at: at(0) },
        { arc_id, phase: "milestone", title: "step", sent_at: at(10) },
      ],
      { partial: true },
    );
    expect(r.ok).toBe(true);
  });

  // §4.5: two blocked events must be separated by a non-blocked event.

  it("rejects two consecutive blocked events", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "blocked", title: "blocker one", sent_at: at(5) },
      { arc_id, phase: "blocked", title: "blocker two", sent_at: at(10) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects consecutive blocked even after a prior resume", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(0) },
      { arc_id, phase: "blocked", title: "first", sent_at: at(5) },
      { arc_id, phase: "milestone", title: "resumed", sent_at: at(10) },
      { arc_id, phase: "blocked", title: "second", sent_at: at(15) },
      { arc_id, phase: "blocked", title: "still", sent_at: at(20) },
    ]);
    expect(r.ok).toBe(false);
  });

  // C4 / §7.5: sent_at monotonicity is opt-in (out-of-order tolerated by default).

  it("tolerates out-of-order sent_at by default", () => {
    const arc_id = "a1";
    const r = validateSequence([
      { arc_id, phase: "started", title: "start", sent_at: at(20) },
      { arc_id, phase: "milestone", title: "step", sent_at: at(10) },
      { arc_id, phase: "done", title: "done", sent_at: at(30) },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects decreasing sent_at when checkMonotonicSentAt is set", () => {
    const arc_id = "a1";
    const r = validateSequence(
      [
        { arc_id, phase: "started", title: "start", sent_at: at(20) },
        { arc_id, phase: "milestone", title: "step", sent_at: at(10) },
        { arc_id, phase: "done", title: "done", sent_at: at(30) },
      ],
      { checkMonotonicSentAt: true },
    );
    expect(r.ok).toBe(false);
  });
});
