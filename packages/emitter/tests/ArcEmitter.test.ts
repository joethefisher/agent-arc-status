import { describe, it, expect } from "vitest";
import { ArcEmitter, type Transport } from "../src/index.js";
import { validate, validateSequence, type ArcStatusEvent } from "@agent-arc-status/reference";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function harness(opts: { floor?: number; window?: number } = {}) {
  const clock = { t: 0 };
  const sent: ArcStatusEvent[] = [];
  const errors: unknown[] = [];
  let tickCb: () => void = () => {};
  const transport: Transport = {
    async send(event) {
      sent.push(event);
    },
  };
  const arc = new ArcEmitter({
    title: "build atlas index",
    arcId: "018f9c31-7e40-7a2b-9c00-0000000000a1",
    arcKind: "build",
    transport,
    cadence: {
      cadenceFloorMs: opts.floor ?? 0,
      silenceWindowMs: opts.window ?? 1_200_000,
      now: () => clock.t,
    },
    timer: {
      setInterval: (cb) => {
        tickCb = cb;
        return 1;
      },
      clearInterval: () => {},
    },
    onError: (e) => errors.push(e),
  });
  return { arc, sent, errors, clock, tick: () => tickCb() };
}

describe("ArcEmitter", () => {
  it("emits a valid started at start() when the floor is 0", async () => {
    const h = harness();
    await h.arc.start();
    expect(h.sent.map((e) => e.phase)).toEqual(["started"]);
    expect(h.sent.every((e) => validate(e).ok)).toBe(true);
  });

  it("run() on success yields a sequence-valid started...done", async () => {
    const h = harness();
    await h.arc.run(async (arc) => {
      await arc.milestone("receiver booted", { step: 1, total: 2 });
    });
    expect(h.sent.map((e) => e.phase)).toEqual(["started", "milestone", "done"]);
    expect(validateSequence(h.sent).ok).toBe(true);
  });

  it("run() on throw yields started...blocked and rethrows", async () => {
    const h = harness();
    await expect(
      h.arc.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(h.sent.map((e) => e.phase)).toEqual(["started", "blocked"]);
    expect(validateSequence(h.sent).ok).toBe(true);
    expect(h.sent[1]!.title).toContain("boom");
  });

  it("ensures a started before an early explicit emit even under a floor", async () => {
    const h = harness({ floor: 300_000 });
    await h.arc.start();
    expect(h.sent).toEqual([]); // floor gates the started
    await h.arc.milestone("early progress");
    expect(h.sent.map((e) => e.phase)).toEqual(["started", "milestone"]);
    expect(validateSequence(h.sent, { partial: true }).ok).toBe(true);
  });

  it("fires an auto-heartbeat once the silence window elapses", async () => {
    const h = harness({ window: 1000 });
    await h.arc.start();
    h.clock.t = 1500;
    h.tick();
    await flush();
    expect(h.sent.map((e) => e.phase)).toEqual(["started", "heartbeat"]);
    expect(h.sent.every((e) => validate(e).ok)).toBe(true);
  });

  it("routes transport failures to onError without throwing", async () => {
    const errors: unknown[] = [];
    const arc = new ArcEmitter({
      title: "build",
      transport: {
        async send() {
          throw new Error("network down");
        },
      },
      cadence: { cadenceFloorMs: 0, now: () => 0 },
      timer: { setInterval: () => 1, clearInterval: () => {} },
      onError: (e) => errors.push(e),
    });
    await arc.start();
    await arc.milestone("still fine");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
