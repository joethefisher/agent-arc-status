# @agent-arc-status/emitter

A batteries-included **producer** for the [Agent Arc Status
Protocol](https://github.com/joethefisher/agent-arc-status). It wraps the reference
`CadenceController` and makes correct emission the default:

- **`started` first, terminal last** — `run(fn)` emits `started` on entry and `done` on success or
  terminal `blocked` on throw, so every stream it produces is `validateSequence`-clean.
- **Automatic silence backstop** — a timer independent of the work loop (§5.2) fires a `heartbeat`
  when the silence window would otherwise elapse.
- **Best-effort transport** — a failed send goes to `onError`; status reporting never crashes the work.
- **Zero runtime dependencies** — Node stdlib only.

```ts
import { ArcEmitter, httpTransport } from "@agent-arc-status/emitter";

const arc = new ArcEmitter({
  title: "nightly: refresh customer health scores",
  arcKind: "batch",
  transport: httpTransport({ url: process.env.ARC_STATUS_URL!, secret: process.env.ARC_STATUS_SECRET }),
});

await arc.run(async (arc) => {
  await arc.milestone("ingested 12k account records", { step: 1, total: 4 });
  // ... work ...
  await arc.milestone("scored and persisted", { step: 4, total: 4 });
});
// -> started, milestone, milestone, done  (all validated, heartbeats auto-filled)
```

## API

- `new ArcEmitter(config)` — `{ title, transport, arcId?, arcKind?, cadence?, heartbeatActivity?,
  tickIntervalMs?, onError? }`.
- `start()`, `milestone(title, opts?)`, `heartbeat(title?, opts?)`, `blocked(title, opts?)`,
  `done(title?, opts?)`, `isTerminal()`, `run(fn)`.
- Transports: `httpTransport({ url, secret?, headers?, fetch? })` (webhook binding §8.1, optional
  HMAC-SHA256) and `stdoutTransport({ write? })` (JSON Lines, §8.3). Implement `Transport` for others.

Everything is injectable (`cadence.now`, `timer`, `transport`, `fetch`) for deterministic tests.
