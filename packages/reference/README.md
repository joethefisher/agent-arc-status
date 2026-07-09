# `@agent-arc-status/reference`: Node reference implementation

Reference TypeScript implementation of the [Agent Arc Status Protocol](../../README.md) v0.2.

Provides:

- Types matching the wire schema (`ArcStatusEvent`, `ArcStatusPhase`)
- A structural validator (`validate`)
- A sequence validator for per-arc phase ordering (`validateSequence`)
- JSON / JSON Lines parsers that never throw (`parse`, `parseJsonl`)
- A default human-line renderer (`render`)
- Cadence helpers (`CadenceController` and `SilenceWatchdog`) that drive the
  silence backstop and cadence-floor gating
- `reduceArc`, which folds an event stream into current arc state

Zero runtime dependencies.

## Install

```bash
npm install @agent-arc-status/reference
```

> Working from a clone instead? This package is a workspace in the
> [monorepo](https://github.com/joethefisher/agent-arc-status); run `npm install` at the repo
> root and the `prepare` script builds `dist/`. The surface is small enough to vendor `src/` too.

## Use

### Emit and validate an event

```ts
import { validate, type ArcStatusEvent } from "@agent-arc-status/reference";

const event: ArcStatusEvent = {
  arc_id: crypto.randomUUID(),
  phase: "milestone",
  title: "receiver booted, smoke test passes",
  step: 5,
  total: 11,
  eta_minutes: 25,
  sent_at: new Date().toISOString(),
  protocol_version: "0.1",
};

const result = validate(event);
if (!result.ok) {
  for (const issue of result.issues) {
    console.error(`${issue.path}: ${issue.message}`);
  }
  throw new Error("malformed arc.status event");
}

await postWebhook("https://...", JSON.stringify(result.event));
```

### Parse a JSON Lines stream of events

```ts
import { parseJsonl, validateSequence } from "@agent-arc-status/reference";
import { readFileSync } from "node:fs";

const { events, errors } = parseJsonl(readFileSync("./arc.jsonl", "utf8"));

if (errors.length > 0) {
  console.warn(`${errors.length} malformed events skipped`);
}

const seq = validateSequence(events);
if (!seq.ok) {
  console.error("arc phase ordering invalid:", seq.issues);
}
```

### Render for human surfaces

```ts
import { render } from "@agent-arc-status/reference";

// "▶ build Pulsefeed v0.1"
render({ ... phase: "started", title: "build Pulsefeed v0.1" });

// "✓ [5/11] receiver booted (ETA 25m)"
render({ ... phase: "milestone", title: "receiver booted", step: 5, total: 11, eta_minutes: 25 });

// "⛔ need finance sign-off on plan-B reclassification\ndetails about what would unblock"
render(event, { body: true });
```

## Development

```bash
npm install
npm test         # vitest
npm run build    # tsc → dist/
npm run typecheck
```

Tests include end-to-end runs against the shipped [`examples/`](../../examples/) JSONL fixtures, so any deviation from the documented examples is caught immediately.

## Scope

This package implements **structural conformance plus cadence discipline**. It does not implement:

- Transport (HTTP/queue/etc.): the Protocol is transport-agnostic; bring your own.
- Persistence: emitters and consumers store events as fits their architecture.

The silence backstop and cadence-floor gating ship as `CadenceController` and
`SilenceWatchdog` (see [`src/cadence.ts`](src/cadence.ts)); drive them from a
timer independent of your work loop, since an emitter that heartbeats from its
own work loop cannot signal liveness in the one case that matters: when that
loop has stalled.

For the canonical schema, see [`spec/schema.json`](../../spec/schema.json). For the full specification, see [`spec/v0.2.md`](../../spec/v0.2.md).
