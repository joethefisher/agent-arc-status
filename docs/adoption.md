# Adoption guide

This guide walks through three common ways to integrate the Agent Arc Status Protocol into existing work. Each is a sketch. Copy and adapt to your stack.

## 1. Emit from a long-running agent script

For a Node script, the smallest sufficient emitter is a function that POSTs an event to a webhook URL. The reference implementation gives you validation and types; you bring transport.

```ts
import { validate, type ArcStatusEvent } from "@agent-arc-status/reference";
import { createHmac, randomUUID } from "node:crypto";

const ARC_STATUS_URL = process.env.ARC_STATUS_URL!;
const ARC_STATUS_SECRET = process.env.ARC_STATUS_SECRET!;

// Bring your own signing; here's a minimal HMAC-SHA256 over the body.
function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function emit(event: ArcStatusEvent): Promise<void> {
  const result = validate(event);
  if (!result.ok) {
    console.error("invalid arc.status event:", result.issues);
    return; // emission failures should not crash the work
  }

  const body = JSON.stringify(result.event);
  const signature = sign(body, ARC_STATUS_SECRET);

  await fetch(ARC_STATUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Event-Type": "arc.status",
      "X-Webhook-Signature": signature,
      "X-Webhook-Delivery-Id": randomUUID(),
    },
    body,
  }).catch((err) => console.error("arc.status emit failed:", err));
}

// usage
const arcId = crypto.randomUUID();
await emit({
  arc_id: arcId,
  phase: "started",
  title: "nightly: refresh customer health scores",
  sent_at: new Date().toISOString(),
  protocol_version: "0.1",
});

// ... work happens ...

await emit({
  arc_id: arcId,
  phase: "milestone",
  title: "ingested 12k account records",
  step: 1,
  total: 4,
  sent_at: new Date().toISOString(),
});

// ... etc ...
```

Three things to add for production use:

- **A silence backstop.** Set a 20-minute timer that resets on every emit; if it fires, emit a `heartbeat` with whatever you're currently doing.
- **A try/finally around the work.** Always emit `done` or `blocked` on exit, never leave an arc hanging.
- **Idempotent delivery.** Treat emission as best-effort; never block work on a slow consumer.

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
