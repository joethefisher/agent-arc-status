import { describe, it, expect } from "vitest";
import { recordArcEvent, arcEmitterForSpan, AGENT_ARC_ID_ATTR, type SpanLike } from "../src/index.js";
import type { ArcStatusEvent } from "@agent-arc-status/reference";

function fakeSpan() {
  const attrs: Record<string, unknown> = {};
  const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
  const statuses: Array<{ code: number; message?: string }> = [];
  const span: SpanLike = {
    setAttribute: (k, v) => {
      attrs[k] = v;
    },
    addEvent: (name, attributes) => {
      events.push({ name, attributes });
    },
    setStatus: (status) => {
      statuses.push(status);
    },
  };
  return { span, attrs, events, statuses };
}

const milestone: ArcStatusEvent = {
  arc_id: "a",
  phase: "milestone",
  title: "receiver booted",
  step: 6,
  total: 11,
  sent_at: "2026-06-14T09:00:00Z",
};

describe("recordArcEvent", () => {
  it("sets the arc_id attribute and an arc.<phase> span event", () => {
    const { span, attrs, events } = fakeSpan();
    recordArcEvent(span, milestone);
    expect(attrs[AGENT_ARC_ID_ATTR]).toBe("a");
    expect(events[0]!.name).toBe("arc.milestone");
    expect(events[0]!.attributes).toMatchObject({ "arc.title": "receiver booted", "arc.step": 6 });
  });

  it("sets OK on done and ERROR on blocked", () => {
    const done = fakeSpan();
    recordArcEvent(done.span, { arc_id: "a", phase: "done", title: "shipped", sent_at: milestone.sent_at });
    expect(done.statuses[0]).toEqual({ code: 1 });

    const blocked = fakeSpan();
    recordArcEvent(blocked.span, { arc_id: "a", phase: "blocked", title: "need sign-off", sent_at: milestone.sent_at });
    expect(blocked.statuses[0]).toEqual({ code: 2, message: "need sign-off" });
  });

  it("arcEmitterForSpan returns a working EmitFn", () => {
    const { span, events } = fakeSpan();
    const emit = arcEmitterForSpan(span);
    void emit(milestone);
    expect(events[0]!.name).toBe("arc.milestone");
  });
});
