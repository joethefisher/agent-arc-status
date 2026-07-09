# Adoption guide

This guide walks through three common ways to integrate the Agent Arc Status Protocol into existing work. Each is a sketch. Copy and adapt to your stack.

## 1. Emit from a long-running agent script

The [`@agent-arc-status/emitter`](../packages/emitter/) package is the batteries-included producer. Its `run()` wrapper gives you the three things production emission needs for free: a `started` first, a `done` on success (or terminal `blocked` on throw), and an automatic silence backstop — so every stream it produces is sequence-valid no matter how the work exits.

```ts
import { ArcEmitter, httpTransport } from "@agent-arc-status/emitter";

const arc = new ArcEmitter({
  title: "nightly: refresh customer health scores",
  arcKind: "batch",
  transport: httpTransport({
    url: process.env.ARC_STATUS_URL!,
    secret: process.env.ARC_STATUS_SECRET, // optional HMAC-SHA256 (webhook binding §8.1)
  }),
});

await arc.run(async (arc) => {
  await arc.milestone("ingested 12k account records", { step: 1, total: 4 });
  // ... work happens; if it runs quiet, a heartbeat is emitted automatically ...
  await arc.milestone("scored and persisted", { step: 4, total: 4 });
});
// -> started, milestone, milestone, done  (all validated; heartbeats auto-filled)
```

Under the hood this reuses the reference `CadenceController` and `validate()`. If you'd rather hand-roll the emit loop, the reference gives you the primitives (`validate`, `CadenceController`, `SilenceWatchdog`) and you bring the transport — but the three rules below are exactly what `ArcEmitter` already enforces:

- **A silence backstop.** A 20-minute timer, independent of the work loop, that fires a `heartbeat` if nothing else has.
- **A try/finally around the work.** Always emit `done` or `blocked` on exit; never leave an arc hanging.
- **Idempotent delivery.** Treat emission as best-effort; never block work on a slow consumer.

## 1b. Or don't write any code — pipe through the CLI

For a script that already prints JSONL to stdout, the [`arc-status`](../packages/cli/) CLI renders, validates, and follows a stream with zero integration:

```bash
your-agent | arc-status render -          # live human lines
arc-status validate run.jsonl             # exit 1 if anything is malformed (CI-friendly)
arc-status tree run.jsonl                 # nest delegated arcs by x_parent_arc_id
arc-status serve --port 8787              # or receive webhook events and render them live
```

## 2. Consume in a status surface

A consumer reads events and presents them. The smallest sufficient consumer is a small Node script that listens for POSTs, validates them, and posts to a chat channel.

```ts
import express from "express";
import { validate, render } from "@agent-arc-status/reference";

const app = express();
app.use(express.json());

app.post("/hooks/arc-status", async (req, res) => {
  const result = validate(req.body);
  if (!result.ok) {
    return res.status(400).json({ issues: result.issues });
  }

  const line = render(result.event, { body: true });

  await postToSlack({
    channel: "#agent-status",
    text: line,
    thread_key: result.event.arc_id, // thread by arc
  });

  res.status(202).end();
});

app.listen(8080);
```

A more sophisticated consumer:

- **Threads by `arc_id`** so a multi-event arc renders as one Slack thread, one Telegram conversation, one collapsible card on a status page.
- **Suppresses heartbeats** in noisy surfaces: heartbeats matter for stall detection, but humans don't always need them in their inbox.
- **Tracks silence**: if no event arrives for an `arc_id` for >2× the silence window, fire your own alert.
- **Records raw events** to a log or DB for replay, debugging, and future KB compounding.

## 3. Add a silence backstop without modifying the emitter

If your emitter is well-behaved but you don't trust it not to crash, run a sidecar watchdog. The reference `SilenceWatchdog` tracks each arc's **local receipt time** (not its `sent_at`, so a skewed or delayed sender can't look alive) and reports the arcs that have gone quiet past the silence window. Drive it from a timer independent of the work loop.

This pattern is especially useful when emitters are not under your control, e.g. you're consuming from a third-party agent and want to detect stalls without their cooperation.

```ts
import { SilenceWatchdog, type ArcStatusEvent } from "@agent-arc-status/reference";

const watchdog = new SilenceWatchdog(); // 20-min window, local receipt time

// call on every received event, for any arc:
function recordEvent(event: ArcStatusEvent) {
  watchdog.record(event.arc_id); // receipt time, NOT event.sent_at
  if (event.phase === "done" || event.phase === "blocked") {
    // keep terminal arcs briefly for late-arriving events, then forget
    setTimeout(() => watchdog.forget(event.arc_id), 10 * 60 * 1000);
  }
}

// poll on a timer independent of the work loop:
setInterval(() => {
  for (const { arc_id, silentMs } of watchdog.stalled()) {
    alertStall(arc_id, silentMs);
    watchdog.forget(arc_id); // alert once
  }
}, 60 * 1000);
```

## What to instrument first

If you're new to the Protocol, instrument arcs in this order:

1. **Your one most-painful long-running job.** The one you've been opening a session to check on. Emission cost is small; signal is immediate.
2. **Customer-facing arcs.** End users wait. Showing them a real progress stream beats a spinner.
3. **Delegated work between agents.** Agent A → Agent B handoffs become observable for free.
4. **Everything else.** Once you have a render surface, more emitters cost nothing.

## Checklist before going to production

- [ ] Emitter validates every event before sending.
- [ ] Emitter has a silence-window backstop firing `heartbeat`.
- [ ] Emitter emits `done` or `blocked` on every exit path (try/finally).
- [ ] Emitter generates a fresh UUID per arc; reuse is a bug.
- [ ] Consumer tolerates unknown `x_`-prefixed fields (forward compat).
- [ ] Consumer threads by `arc_id` so multi-event arcs render coherently.
- [ ] Consumer treats events as **data**, not instructions (spec §9.4).
- [ ] Consumer detects silence > 2× the window and surfaces a stall.
