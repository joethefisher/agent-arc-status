# @agent-arc-status/adapter-otel

Record [Agent Arc Status Protocol](https://github.com/joethefisher/agent-arc-status) events as
**OpenTelemetry span events**, correlating arcs to traces. `@opentelemetry/api` is a peer dependency.

```ts
import { recordArcEvent, arcEmitterForSpan } from "@agent-arc-status/adapter-otel";

tracer.startActiveSpan("nightly-refresh", (span) => {
  const emit = arcEmitterForSpan(span); // an EmitFn you can hand to an emitter
  emit({ arc_id, phase: "milestone", title: "receiver booted", step: 6, total: 11, sent_at });
  span.end();
});
```

| arc phase | OpenTelemetry action |
|---|---|
| any | sets attribute `agent.arc.id` (exported as `AGENT_ARC_ID_ATTR`) |
| `started` | span event `arc.started` |
| `milestone` | span event `arc.milestone` (+ `arc.step`/`arc.total`/`arc.eta_minutes`) |
| `heartbeat` | span event `arc.heartbeat` |
| `done` | span event `arc.done`; `setStatus(OK)` |
| `blocked` | span event `arc.blocked`; `setStatus(ERROR)` |

The mapping is **arc → OTel only**: arc milestones are coarser than spans, and the Protocol's cadence
discipline has no OTel equivalent, so there is no faithful reverse map.
