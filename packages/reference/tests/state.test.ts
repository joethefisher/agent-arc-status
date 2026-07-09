import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { reduceArc } from "../src/state.js";
import { parseJsonl } from "../src/parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, "../../../examples");

function load(file: string) {
  return parseJsonl(readFileSync(resolve(examplesDir, file), "utf8")).events;
}

describe("reduceArc", () => {
  it("returns null for an empty sequence", () => {
    expect(reduceArc([])).toBeNull();
  });

  it("folds a completed build into a done state with milestones, blocker cleared", () => {
    const events = load("02-feature-build.jsonl");
    const s = reduceArc(events)!;
    expect(s.status).toBe("done");
    expect(s.phase).toBe("done");
    expect(s.blocked).toBeNull();
    expect(s.eventCount).toBe(events.length);
    expect(s.title).toBe(events[0]!.title); // started is first
    expect(s.startedAt).toBe(events[0]!.sent_at);
    expect(s.milestones.length).toBe(
      events.filter((e) => e.phase === "milestone").length,
    );
  });

  it("folds a blocked-then-resumed arc to done with the blocker cleared", () => {
    const s = reduceArc(load("04-blocked-and-resumed.jsonl"))!;
    expect(s.status).toBe("done");
    expect(s.blocked).toBeNull();
  });

  it("folds a terminal-blocked arc to a blocked state holding the blocker", () => {
    const events = load("05-terminal-blocked.jsonl");
    const s = reduceArc(events)!;
    expect(s.status).toBe("blocked");
    expect(s.phase).toBe("blocked");
    expect(s.blocked?.title).toBe(events[events.length - 1]!.title);
  });

  it("reports active for an in-flight arc and surfaces latest step/total", () => {
    const arc_id = "a1";
    const s = reduceArc([
      { arc_id, phase: "started", title: "build", sent_at: "2026-06-14T02:00:00.000Z" },
      {
        arc_id,
        phase: "milestone",
        title: "m",
        step: 1,
        total: 3,
        sent_at: "2026-06-14T02:10:00.000Z",
      },
    ])!;
    expect(s.status).toBe("active");
    expect(s.step).toBe(1);
    expect(s.total).toBe(3);
    expect(s.blocked).toBeNull();
    expect(s.lastEventAt).toBe("2026-06-14T02:10:00.000Z");
  });
});
