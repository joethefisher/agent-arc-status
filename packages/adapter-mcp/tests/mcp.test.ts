import { describe, it, expect } from "vitest";
import { mcpProgressToArc, arcToMcpProgress, mcpProgressNotifier } from "../src/index.js";
import { validate, type ArcStatusEvent } from "@agent-arc-status/reference";

const ctx = { arcId: "a", title: "reindex corpus", now: () => Date.UTC(2026, 5, 14, 9, 0, 0) };

describe("mcpProgressToArc", () => {
  it("maps progress/total/message to a valid milestone", () => {
    const event = mcpProgressToArc({ progressToken: "t", progress: 3, total: 8, message: "shard 3" }, ctx);
    expect(event.phase).toBe("milestone");
    expect(event.step).toBe(3);
    expect(event.total).toBe(8);
    expect(event.title).toBe("shard 3");
    expect(validate(event).ok).toBe(true);
  });

  it("omits non-integer progress and falls back to the context title", () => {
    const event = mcpProgressToArc({ progressToken: "t", progress: 0.5 }, ctx);
    expect(event.step).toBeUndefined();
    expect(event.title).toBe("reindex corpus");
    expect(validate(event).ok).toBe(true);
  });
});

describe("arcToMcpProgress", () => {
  it("maps a milestone to progress params", () => {
    const event: ArcStatusEvent = {
      arc_id: "a",
      phase: "milestone",
      title: "shard 3",
      step: 3,
      total: 8,
      sent_at: "2026-06-14T09:00:00Z",
    };
    expect(arcToMcpProgress(event, "tok")).toEqual({
      progressToken: "tok",
      progress: 3,
      total: 8,
      message: "shard 3",
    });
  });
});

describe("mcpProgressNotifier", () => {
  it("emits a valid event per progress notification", () => {
    const emitted: ArcStatusEvent[] = [];
    const notify = mcpProgressNotifier((e) => void emitted.push(e), ctx);
    void notify({ progressToken: "t", progress: 1, total: 2, message: "half" });
    expect(emitted).toHaveLength(1);
    expect(validate(emitted[0]!).ok).toBe(true);
  });
});
