# Example arc-status streams

Each file in this directory is a [JSON Lines](https://jsonlines.org/) stream of `arc.status` events representing one full arc. They are **fully synthetic**: an invented company (Meridian Loom) building an invented product (Pulsefeed), with invented people, tickets, and data. No real systems, people, or business data appear. They are intended both as documentation and as conformance test material.

| File | Scenario | Illustrates |
|---|---|---|
| [`01-short-arc.jsonl`](01-short-arc.jsonl) | A sub-cadence-floor arc (under 5 min) | When NOT to emit. The file is intentionally empty: short arcs should produce no `arc.status` events at all. The outcome arrives before status would be useful. |
| [`02-feature-build.jsonl`](02-feature-build.jsonl) | A multi-step feature build (~90 min) | Standard `started → milestone* → done` sequence with `step`/`total` fields. Milestones land within the silence window, so no heartbeat is needed. |
| [`03-long-autonomous.jsonl`](03-long-autonomous.jsonl) | A long autonomous build (~3.5 hours) | Silence-window backstop: a `heartbeat` fills every stretch where no milestone has landed for the silence window, so no gap between consecutive events exceeds 20 minutes. |
| [`04-blocked-and-resumed.jsonl`](04-blocked-and-resumed.jsonl) | A blocker arrives mid-arc, then resolves | `blocked` → resume via `milestone` → `done`. The long wait after `blocked` carries no heartbeat. A blocked arc is not silently working, and heartbeat is not a legal resume signal (§4.5/§4.6). |
| [`05-terminal-blocked.jsonl`](05-terminal-blocked.jsonl) | A blocker arrives and never resolves | An arc that legitimately ends in `blocked` rather than `done`, with heartbeats keeping the active investigation under the silence window. |

Each event in these files validates against [`spec/schema.json`](../spec/schema.json), and each full stream is conformant under the reference sequence validator. The reference implementation [`packages/reference/`](../packages/reference/) uses these as test fixtures.
