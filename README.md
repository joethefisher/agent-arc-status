# Agent Arc Status Protocol

> **A standard event vocabulary for autonomous agent work-in-progress.**
> So humans, agents, and dashboards can tell whether a long-running arc is making progress, idling, or stuck, without polling the agent or peeking into its session.

[![npm](https://img.shields.io/npm/v/@agent-arc-status/reference?label=npm)](https://www.npmjs.com/package/@agent-arc-status/reference)
[![PyPI](https://img.shields.io/pypi/v/agent-arc-status?label=PyPI)](https://pypi.org/project/agent-arc-status/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Spec: v0.2](https://img.shields.io/badge/Spec-v0.2-green.svg)](spec/v0.2.md)

## The problem

You give an autonomous agent a real task. It accepts. Then... silence.

- Five minutes in: probably still working.
- Twenty minutes in: is it stuck? Did it crash? Is it about to finish?
- An hour in: you open the session to check. The agent is fine but loses cache. You break flow for nothing. Or you don't check, and it actually crashed forty minutes ago.

Every team building with long-running agents hits this. The usual responses:

- **Polling** the agent for status: interrupts its work, costs tokens, doesn't scale.
- **Log scraping**: every team invents their own format, nothing is portable.
- **Custom observability tooling**: solves it once, for one stack, behind a vendor.
- **"It's fine, just wait"**: guesswork as a strategy.

None of these compose. None of them work when Agent A wants to know if Agent B is making progress on a delegated task.

## What this is

A small, opinionated protocol that gives agents a shared vocabulary and delivery semantics for **emitting progress events about a unit of authorized work** (an "arc").

It standardizes:

- **What an event looks like**: JSON shape, required vs. optional fields, semantic versioning.
- **What phases exist**: `started`, `milestone`, `heartbeat`, `done`, `blocked`. That's it.
- **When to emit**: a cadence floor (don't fire on trivial work) and a silence backstop (fire every 20 min in long arcs so silence is unambiguous).
- **How to deliver**: transport-agnostic; works over webhooks, message queues, MCP, anything that moves JSON.

It is deliberately not:

- An observability platform.
- An agent framework.
- A vendor product.
- A trace/span model (that's [OpenTelemetry](https://opentelemetry.io)'s job, see [docs/comparison.md](docs/comparison.md)).

It's the smallest standard that lets independent agents, dashboards, and human consoles agree on **"is the work alive and moving?"**

## Who this is for

- **Practitioners** building agents that take more than a couple minutes to do real work, who want a clean way to surface progress without inventing one.
- **Entrepreneurs** shipping agent products where end users will sit and wait, who need a portable status surface they don't have to build twice.
- **Startups** running multi-agent systems where Agent A delegates to Agent B, and the orchestrator needs to know B is alive.
- **Tool builders** writing dashboards, status surfaces, Slack/Telegram bots, or monitoring that needs an agent-agnostic input format.

## Quick start

A single `arc.status` event is one JSON object:

```json
{
  "arc_id": "00000000-0000-4000-8000-000000000001",
  "phase": "milestone",
  "title": "milestone 6/11: routing table + worker shipped",
  "body": "Worker now claims pending deliveries, dispatches via shell-out, marks delivered. 9 tests added.",
  "step": 6,
  "total": 11,
  "eta_minutes": 30,
  "sent_at": "2026-06-14T02:10:48.855Z"
}
```

The `arc_id` is a stable UUID for the whole arc. Every event in the same arc reuses it. That's how downstream consumers (dashboards, parent agents, logs) thread events into one timeline.

A full arc looks like a sequence of these:

```jsonl
{"arc_id":"a1","phase":"started",  "title":"build Pulsefeed v0.1",                  "sent_at":"..."}
{"arc_id":"a1","phase":"milestone","title":"scaffold + tests green",  "step":1,"total":11,"sent_at":"..."}
{"arc_id":"a1","phase":"milestone","title":"receiver booted",         "step":5,"total":11,"sent_at":"..."}
{"arc_id":"a1","phase":"heartbeat","title":"still working: systemd unit debug",    "sent_at":"..."}
{"arc_id":"a1","phase":"milestone","title":"worker delivering end-to-end","step":8,"total":11,"sent_at":"..."}
{"arc_id":"a1","phase":"done",     "title":"v0.1 complete, 43 tests, deployed",     "sent_at":"..."}
```

See [`examples/`](examples/) for realistic full sequences (short arc, multi-milestone build, long autonomous run, blocked arc).

## The five phases at a glance

| Phase | When to fire | How often |
|---|---|---|
| `started` | Arc begins, *and* expected duration exceeds the cadence floor (default: 5 min) | Exactly once |
| `milestone` | A meaningful checkpoint: a commit, a service up, a sub-goal hit | Per checkpoint |
| `heartbeat` | No other event has fired in the silence window (default: 20 min) and the arc is still active | Auto-fired by the silence backstop |
| `done` | The arc is complete and verified from the consumer's vantage point | Exactly once |
| `blocked` | Hard blocker that requires external input to resolve | At most once per blocker; emit a `milestone` when unblocked |

Full semantics, MUST/SHOULD/MAY rules, and validation logic live in [spec/v0.2.md](spec/v0.2.md).

## Install and use

The reference implementations and tooling are published on npm and PyPI, so you can pull them straight into your project. Everything here has zero runtime dependencies.

```bash
# Try the CLI without installing anything:
npx @agent-arc-status/cli render examples/03-long-autonomous.jsonl

# TypeScript or JavaScript:
npm install @agent-arc-status/reference

# Python:
pip install agent-arc-status
```

Here is the full set. Each npm package installs with `npm install <name>`; the Python one is on PyPI.

| Package | What it does |
|---|---|
| [`@agent-arc-status/reference`](packages/reference/) | The TypeScript reference: types, validator, renderer, cadence, state, and delegation-tree tooling |
| [`agent-arc-status`](reference/python/) (PyPI) | The Python reference, a faithful port of the TypeScript one |
| [`@agent-arc-status/emitter`](packages/emitter/) | A producer that handles the fiddly parts for you: a started event first, a done or blocked event on exit, and automatic heartbeats |
| [`@agent-arc-status/cli`](packages/cli/) | The `arc-status` command, to render, validate, tree, tail, or serve a stream |
| [`@agent-arc-status/dashboard`](packages/dashboard/) | The `arc-dashboard` command, a live web view of in-flight arcs |
| [`@agent-arc-status/adapter-otel`](packages/adapter-otel/) | Records arc events as OpenTelemetry span events |
| [`@agent-arc-status/adapter-mcp`](packages/adapter-mcp/) | Bridges MCP progress notifications and arc events, in both directions |
| [`@agent-arc-status/adapter-langchain`](packages/adapter-langchain/) | A LangChain callback handler that emits arc events at chain and agent boundaries |

The TypeScript reference is the one to check your work against, but it is not the only implementation you are allowed to use. The Python port passes the same [language-agnostic conformance suite](conformance/), so the two agree on exactly what a valid stream looks like. If you write your own implementation in another language, that suite is how you show it interoperates.

Working from a clone? It is an npm workspaces monorepo, so `npm install` at the root sets up every package and `npm test` runs the whole thing.

## Why we built this

The protocol came out of a real pain: a builder running long autonomous agent arcs, watching them go silent for 20+ minutes at a stretch, and having no way to tell "alive and grinding" from "wedged and dead." Every workaround we tried (polling, log-tailing, opening the session) traded one problem for another.

We wrote down the smallest protocol that would have solved it on day one (a phase vocabulary, a cadence rule, a silence backstop), and discovered that the same primitive solves four other problems we hadn't been thinking about:

1. **Agent-to-agent task handoff**: delegated work is just an arc with a different observer.
2. **Long-running customer-facing AI features**: the same event stream feeds a progress bar.
3. **Audit + replay**: recording arc-status streams gives you a per-arc timeline for free.
4. **Cross-stack observability**: agents from different frameworks can report progress to the same dashboard.

That breadth, combined with the fact that nothing in the ecosystem standardizes it today, is why we think it's worth publishing as a community spec rather than keeping it in-house.

Longer-form rationale: [docs/motivation.md](docs/motivation.md).

## How to engage

- **Adopt it.** Implement in your stack, file an issue if anything is unclear or doesn't fit your case.
- **Propose a change.** PRs against `spec/` are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) for the RFC process.
- **Tell us what broke.** The fastest way to mature a protocol is to hear about its rough edges from real users.

## License

MIT. See [LICENSE](LICENSE). Use it, fork it, vendor it, embed it. No warranty. Attribution welcome but not required.
