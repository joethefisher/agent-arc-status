import { describe, it, expect } from "vitest";
import { CadenceController, SilenceWatchdog } from "../src/cadence.js";
import { validate } from "../src/validate.js";

/** A deterministic injectable clock (ms epoch). */
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const FLOOR = 5 * 60_000;
const WINDOW = 20 * 60_000;

describe("CadenceController", () => {
  it("emits nothing until the cadence floor is crossed, then a retroactive started (S3)", () => {
    const c = clock();
    const ctrl = new CadenceController({ now: c.now });
    expect(ctrl.begin({ arc_id: "a1", title: "long job" })).toBeNull();
    c.advance(FLOOR - 1);
    expect(ctrl.tick()).toBeNull(); // still under the floor
    c.advance(1);
    const started = ctrl.tick(); // floor crossed
    expect(started?.phase).toBe("started");
    expect(started?.title).toBe("long job");
  });

  it("emits started immediately when the floor is 0", () => {
    const c = clock();
    const ctrl = new CadenceController({ now: c.now, cadenceFloorMs: 0 });
    expect(ctrl.begin({ arc_id: "a1", title: "x" })?.phase).toBe("started");
  });

  it("fires a heartbeat only after the silence window, and resets on emit", () => {
    const c = clock();
    const ctrl = new CadenceController({ now: c.now, cadenceFloorMs: 0 });
    ctrl.begin({ arc_id: "a1", title: "x" });
    c.advance(WINDOW - 1);
    expect(ctrl.tick()).toBeNull();
    c.advance(1);
    expect(ctrl.tick()?.phase).toBe("heartbeat");

    // a real emit resets the silence timer
    ctrl.onEmit({
      arc_id: "a1",
      phase: "milestone",
      title: "m",
      sent_at: new Date(c.now()).toISOString(),
    });
    c.advance(WINDOW - 1);
    expect(ctrl.tick()).toBeNull();
  });

  it("uses currentActivity as the heartbeat title", () => {
    const c = clock();
    const ctrl = new CadenceController({ now: c.now, cadenceFloorMs: 0 });
    ctrl.begin({ arc_id: "a1", title: "x" });
    c.advance(WINDOW);
    expect(ctrl.tick("compiling shaders")?.title).toBe("compiling shaders");
  });

  it("stops emitting once terminal (done)", () => {
    const c = clock();
    const ctrl = new CadenceController({ now: c.now, cadenceFloorMs: 0 });
    ctrl.begin({ arc_id: "a1", title: "x" });
    ctrl.onEmit({
      arc_id: "a1",
      phase: "done",
      title: "done",
      sent_at: new Date(c.now()).toISOString(),
    });
    expect(ctrl.isTerminal()).toBe(true);
    c.advance(WINDOW * 5);
    expect(ctrl.tick()).toBeNull();
  });

  it("generates events that pass validate()", () => {
    const c = clock();
    const ctrl = new CadenceController({ now: c.now, cadenceFloorMs: 0 });
    const started = ctrl.begin({
      arc_id: "00000000-0000-4000-8000-000000000001",
      title: "long job",
    });
    expect(started && validate(started).ok).toBe(true);
    c.advance(WINDOW);
    const hb = ctrl.tick();
    expect(hb && validate(hb).ok).toBe(true);
  });
});

describe("SilenceWatchdog", () => {
  it("keys stall detection on local receipt time, not sent_at (S2)", () => {
    const c = clock();
    const w = new SilenceWatchdog({ now: c.now });
    // Record receipt NOW even though the event's own sent_at could be ancient.
    w.record("a1", c.now());
    c.advance(WINDOW - 1);
    expect(w.stalled()).toEqual([]);
    c.advance(1);
    expect(w.stalled().map((s) => s.arc_id)).toEqual(["a1"]);
  });

  it("record() defaults receipt time to now() and reports silentMs", () => {
    const c = clock();
    const w = new SilenceWatchdog({ now: c.now });
    w.record("a1");
    c.advance(WINDOW + 5);
    const s = w.stalled();
    expect(s[0]?.arc_id).toBe("a1");
    expect(s[0]?.silentMs).toBe(WINDOW + 5);
  });

  it("forget() drops an arc from stall tracking", () => {
    const c = clock();
    const w = new SilenceWatchdog({ now: c.now });
    w.record("a1");
    c.advance(WINDOW + 1);
    w.forget("a1");
    expect(w.stalled()).toEqual([]);
  });
});
