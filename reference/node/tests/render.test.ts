import { describe, it, expect } from "vitest";
import { render } from "../src/render.js";
import type { ArcStatusEvent } from "../src/types.js";

const base = (overrides: Partial<ArcStatusEvent>): ArcStatusEvent => ({
  arc_id: "a1",
  phase: "started",
  title: "build Pulsefeed v0.1",
  sent_at: "2026-06-14T02:00:00.000Z",
  ...overrides,
});

describe("render", () => {
  it("renders a started event with the started symbol", () => {
    const line = render(base({ phase: "started", title: "build foo" }));
    expect(line).toBe("▶ build foo");
  });

  it("renders a milestone with step/total when present", () => {
    const line = render(
      base({ phase: "milestone", title: "receiver booted", step: 5, total: 11 }),
    );
    expect(line).toBe("✓ [5/11] receiver booted");
  });

  it("includes ETA when present, formatted in minutes under 60", () => {
    const line = render(
      base({ phase: "milestone", title: "step", eta_minutes: 25 }),
    );
    expect(line).toBe("✓ step (ETA 25m)");
  });

  it("formats ETA in h+m for >= 60 min", () => {
    const line = render(
      base({ phase: "milestone", title: "step", eta_minutes: 95 }),
    );
    expect(line).toBe("✓ step (ETA 1h35m)");
  });

  it("formats ETA as plain hours when minutes are zero", () => {
    const line = render(
      base({ phase: "milestone", title: "step", eta_minutes: 120 }),
    );
    expect(line).toBe("✓ step (ETA 2h)");
  });

  it("uses the heartbeat symbol for heartbeat phase", () => {
    const line = render(base({ phase: "heartbeat", title: "still working" }));
    expect(line.startsWith("·")).toBe(true);
  });

  it("uses the done symbol for done phase", () => {
    const line = render(base({ phase: "done", title: "complete" }));
    expect(line.startsWith("■")).toBe(true);
  });

  it("uses the blocked symbol for blocked phase", () => {
    const line = render(base({ phase: "blocked", title: "need finance signoff" }));
    expect(line.startsWith("⛔")).toBe(true);
  });

  it("appends body when body=true", () => {
    const line = render(
      base({ phase: "milestone", title: "step", body: "details details" }),
      { body: true },
    );
    expect(line).toContain("\ndetails details");
  });

  it("truncates body to bodyMax", () => {
    const line = render(
      base({ phase: "milestone", title: "step", body: "x".repeat(100) }),
      { body: true, bodyMax: 20 },
    );
    expect(line.endsWith("…")).toBe(true);
    expect(line.split("\n")[1]?.length).toBe(20);
  });

  it("omits symbol when symbol=false", () => {
    const line = render(base({ phase: "started", title: "build" }), {
      symbol: false,
    });
    expect(line).toBe("build");
  });

  it("includes phase label when phaseLabel=true", () => {
    const line = render(
      base({ phase: "milestone", title: "step" }),
      { symbol: false, phaseLabel: true },
    );
    expect(line).toBe("MILESTONE step");
  });

  it("does not include step/total when only one is present", () => {
    const line = render(
      base({ phase: "milestone", title: "step", step: 5 }),
    );
    expect(line).toBe("✓ step");
  });

  it("does not include eta when not present", () => {
    const line = render(base({ phase: "milestone", title: "step" }));
    expect(line).not.toContain("ETA");
  });

  it("does not emit garbage body for bodyMax of 0 (clamps to a lone ellipsis)", () => {
    const line = render(
      base({ phase: "milestone", title: "step", body: "hello" }),
      { body: true, bodyMax: 0 },
    );
    expect(line.split("\n")[1]).toBe("…");
  });

  it("rolls 119.6 minutes up to 2h, not 1h60m", () => {
    const line = render(
      base({ phase: "milestone", title: "step", eta_minutes: 119.6 }),
    );
    expect(line).toBe("✓ step (ETA 2h)");
  });

  it("rolls 59.6 minutes up to 1h, not 60m", () => {
    const line = render(
      base({ phase: "milestone", title: "step", eta_minutes: 59.6 }),
    );
    expect(line).toBe("✓ step (ETA 1h)");
  });
});
