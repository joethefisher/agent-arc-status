# @agent-arc-status/dashboard — `arc-dashboard`

A **zero-dependency** live web view of in-flight [Agent Arc Status
Protocol](https://github.com/joethefisher/agent-arc-status) arcs. POST events to `/ingest`; watch
them render as cards with progress bars, status, milestone counts, blockers, and a stall glow.

```bash
npx @agent-arc-status/dashboard          # http://127.0.0.1:8686
# then POST arc.status events to http://127.0.0.1:8686/ingest
```

Pairs directly with `@agent-arc-status/emitter`'s `httpTransport` (point it at `/ingest`).

## Design

A deliberately thin server: it validates untrusted webhook events, folds them to arc **state**, and
streams that state as JSON over Server-Sent Events. The browser renders cards from JSON using
`textContent`/`createElement` — **never `innerHTML`** — so a hostile `title` or `body` can't execute.
That trust boundary (spec §9.4) is the whole point.

- `POST /ingest` — validate (400 on bad input), 64KB body cap (413), optional HMAC-SHA256 (401), then broadcast.
- `GET /events` — SSE: an initial `snapshot` of every arc's `reduceArc` state, then live `event` frames.
- `GET /` — a single static page (`default-src 'self'` CSP, no inline scripts).

Binds `127.0.0.1` by default. The store is bounded (evicts oldest arcs). Programmatic use:

```ts
import { startDashboard } from "@agent-arc-status/dashboard";
const dash = await startDashboard({ port: 8686, hmacSecret: process.env.ARC_STATUS_SECRET });
console.log(dash.url);
// ... await dash.close();
```

Environment: `PORT`, `HOST`, `ARC_STATUS_SECRET`.
