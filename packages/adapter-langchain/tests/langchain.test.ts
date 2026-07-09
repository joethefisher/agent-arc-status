import { describe, it, expect } from "vitest";
import { ArcStatusCallbackHandler } from "../src/index.js";
import { validate, validateSequence, type ArcStatusEvent } from "@agent-arc-status/reference";

function handler() {
  const emitted: ArcStatusEvent[] = [];
  let t = Date.UTC(2026, 5, 14, 9, 0, 0);
  const h = new ArcStatusCallbackHandler({
    emit: (e) => void emitted.push(e),
    arcId: "a",
    title: "research agent",
    arcKind: "agent",
    now: () => (t += 1000),
  });
  return { h, emitted };
}

describe("ArcStatusCallbackHandler", () => {
  it("maps a successful run to a sequence-valid started...milestone...done", async () => {
    const { h, emitted } = handler();
    await h.handleChainStart({}, {}, "root");
    await h.handleAgentAction({ tool: "search" }, "root");
    await h.handleChainEnd({}, "root");

    expect(emitted.map((e) => e.phase)).toEqual(["started", "milestone", "done"]);
    expect(emitted[1]!.title).toBe("action: search");
    expect(emitted.every((e) => validate(e).ok)).toBe(true);
    expect(validateSequence(emitted).ok).toBe(true);
  });

  it("maps an error to terminal blocked", async () => {
    const { h, emitted } = handler();
    await h.handleChainStart({}, {}, "root");
    await h.handleChainError(new Error("rate limited"), "root");

    expect(emitted.map((e) => e.phase)).toEqual(["started", "blocked"]);
    expect(emitted[1]!.title).toContain("rate limited");
    expect(validateSequence(emitted).ok).toBe(true);
  });

  it("ignores child (non-root) chain starts and ends", async () => {
    const { h, emitted } = handler();
    await h.handleChainStart({}, {}, "root");
    await h.handleChainStart({}, {}, "child", "root"); // nested — must not re-emit started
    await h.handleChainEnd({}, "child", "root"); // nested — must not emit done
    await h.handleChainEnd({}, "root");

    expect(emitted.map((e) => e.phase)).toEqual(["started", "done"]);
  });
});
