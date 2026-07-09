# Motivation

## The silence problem

Modern AI agents are increasingly tasked with work that takes minutes to hours. Code builds, data pipelines, research arcs, customer-facing automations. The work itself is interesting; the *experience* of watching it is not.

When you hand an agent a multi-hour job, you get one of two failure modes:

**Mode 1: silence-as-success-or-failure.** The agent says "OK, working on it" and disappears. Twenty minutes pass. Thirty. An hour. Is it still going? Did it crash? Did it complete and forget to tell you? You don't know. Worse, *you can't ask*. Opening the session breaks its cache, costs tokens, and often interrupts whatever it was doing.

**Mode 2: status-as-noise.** The agent reports every single tool call. By minute ten there are forty-seven progress lines and you've stopped reading. The information density is wrong.

Both fail the same human need: **"give me a signal that the work is still alive, occasionally enough that I trust it, and only when something has actually happened."**

## Why existing tools don't solve this

The market has several adjacent solutions, none of which fit.

**OpenTelemetry traces** model spans well, but a span ends with a status (`OK`, `ERROR`, `UNSET`). It has no concept of "still running, here's where I am." Spans are observability for software systems, not for in-progress human-meaningful work.

**Agent platform observability (LangSmith, LangFuse)** captures every internal event. That's the right granularity for debugging an agent run, but the wrong granularity for "is this still alive." They also lock you into one vendor and one framework.

**Custom status surfaces** (Slack channels, status pages, dashboards) work but require each team to invent their own format, render their own surface, and reinvent the wheel for every new agent. Nothing ports across teams or stacks.

**Workflow engines (Inngest, Temporal, Airflow)** have first-class progress concepts, but they only work for code that you wrote inside the engine. They don't help when Agent A delegates to Agent B and neither is "in" the workflow engine.

What's missing is a **portable, framework-agnostic, vendor-neutral vocabulary** for the specific moment when one piece of agent work needs to tell another piece of work (or a human) "I'm alive, here's where I am."

## The design: why these specific decisions

### Why five phases, not three, not nine

The Protocol defines exactly `started`, `milestone`, `heartbeat`, `done`, `blocked`. We considered both narrower and broader options.

A simpler vocabulary (`started`, `ongoing`, `done`) collapses meaningful distinctions:

- `heartbeat` (no news, still alive) and `milestone` (real news) carry different information and should be distinguished. Consumers handle them differently: a heartbeat is "carry on," a milestone is "take note."
- `blocked` deserves its own phase because it changes who needs to act: the agent has stopped because someone *else* must do something. Collapsing this into `ongoing` hides the most important signal in the stream.

A richer vocabulary (`started`, `planning`, `executing`, `verifying`, `cleaning`, `done`...) sounds appealing but creates ambiguity at every emission site. Was that step "planning" or "executing"? Adding semantic surface area without a forcing function for what each value *means* is how protocols become unimplementable.

Five phases is the smallest vocabulary that captures all the meaningful distinctions and offers no degrees of freedom inside any one phase.

### Why a cadence floor

Without one, the Protocol becomes a license to spam progress on trivial work. With one, consumers (especially human ones) can trust that any arc emitting events is worth their attention.

Five minutes was chosen because it matches the human silence-tolerance window. Below that, silence is normal. Above it, silence becomes ambiguous. Implementations are free to tune the floor; the default exists so adopters don't have to think about it.

### Why a silence backstop (`heartbeat`)

Because silence is otherwise ambiguous. A 20-minute gap can mean "still working hard" or "crashed forty minutes ago." Without a heartbeat, every consumer must guess. With one, silence becomes a signal: if even the heartbeat is missing, something is genuinely wrong, and the consumer can act.

Twenty minutes is long enough that heartbeats don't become noise, short enough that a stall is detected before it costs a meaningful amount of time. Implementations can tune it; the default keeps adopters from designing this from scratch.

### Why "receiver renders"

The Protocol emits structured data, not formatted strings. Why?

- The same event needs to render differently for a Slack message, a Telegram bot, a terminal, a status page, and a database row. Forcing the emitter to pick one format breaks the others.
- The emitter doesn't know all the consumers, especially when events fan out. Coupling the wire format to a presentation choice would make multi-consumer architectures impossible.
- Receivers are best-positioned to format for their context. A terminal can use ANSI colors; a Slack bot can use Block Kit; a Telegram bot can parse the body as markdown. None of those should leak into the wire shape.

This is the same separation-of-concerns principle that makes [structured logging](https://www.thoughtworks.com/insights/blog/microservices/structured-logging-better-insights) succeed where freeform logs struggle.

### Why transport-agnostic

Because the same protocol needs to work over HTTP webhooks, message queues, stdout, MCP tool results, and whatever comes next. Defining a single transport would either constrain adopters to one stack or fork the protocol per transport. Neither is acceptable for a vocabulary that aims to be portable.

The reference webhook binding in §8.1 of the spec is a recommendation, not a requirement. Other bindings are equally legitimate.

## What we deliberately left out

A few decisions in the negative space:

- **No sub-arc/parent-arc relationships yet.** When Agent A delegates to Agent B, the obvious move is to model B's arc as a child of A's. v0.2 still keeps `arc_id` flat, because we haven't seen enough delegation usage to know if a single `parent_arc_id` is enough or if the relationship is a richer graph. Rather than freeze the wrong shape, we pre-register the convention: emitters that need parent/child threading today use `x_parent_arc_id`, and a future minor promotes it to a first-class field once real delegation usage settles the shape (see [spec §12.1](../spec/v0.2.md#12-open-questions)).
- **No progress percentage.** We considered a `progress_pct` field. We left it out because most agent work is poorly modeled as a fraction. "60% done" is rarely meaningful when the work involves discovery. `step`/`total` covers the genuinely discretized cases.
- **No cancellation phase.** v0.1 expresses cancellation as terminal `blocked` with an explanatory body. Whether to elevate `canceled` to a first-class phase depends on whether adopters routinely distinguish "couldn't continue" from "chose not to continue."
- **No retry / replay semantics.** The Protocol does not say anything about retrying a failed event delivery. That's a transport concern, not a vocabulary concern.

## What good adoption looks like

We expect the Protocol to land well when:

- A team building a long-running agent product wires emission into their main work loop, then surfaces the events to end users via a small renderer.
- A multi-agent system uses the Protocol as the lingua franca for delegated work. Agent A sends a task to Agent B, B emits arc-status events, and A consumes them to know when to follow up.
- A startup with a heterogeneous agent stack (some LangChain, some custom, some MCP-driven) standardizes on the Protocol as the one common observability format, with a single dashboard reading all streams.

We expect rough edges when:

- Teams overload `milestone` for every internal step (anti-pattern §5.3). The fix is the heuristic: *if the consumer asked right now "how is it going?", what's the answer?*
- Teams skip the silence backstop. The fix is structural: pair Protocol adoption with a watchdog that fires `heartbeat` automatically.
- Teams emit `done` before the deliverable is actually visible. This one is harder to design around. The spec calls it out as a conformance violation, but adopters need to enforce it culturally too.

## Where this is going

The protocol is still a draft (v0.2). It reaches v1.0 once at least one external implementation reports interoperability with the reference. We expect the design to absorb feedback from adopters before then, particularly around the [open questions in §12](../spec/v0.2.md#12-open-questions) of the spec.

Since the v0.2 draft, the reference tooling has grown substantially (shipped as `0.3.0`, protocol still `0.2`):

- **A Python reference implementation** ([`reference/python/`](../reference/python/)) — a faithful, zero-dependency 1:1 port that passes the same conformance corpus as the TypeScript reference, demonstrating cross-language interoperability.
- **A packaged conformance suite** ([`conformance/`](../conformance/)) — a language-agnostic corpus any implementation runs with its own runner; two implementations agreeing on it is exactly the v1.0 interoperability evidence.
- **Adoption surface** — a batteries-included [emitter](../packages/emitter/), a zero-dependency [`arc-status` CLI](../packages/cli/), a live [web dashboard](../packages/dashboard/), and framework adapters for [LangChain](../packages/adapter-langchain/), [MCP](../packages/adapter-mcp/), and [OpenTelemetry](../packages/adapter-otel/).

Still ahead: real-world adopter feedback, and — once multi-agent delegation usage settles the shape — promoting the interim `x_parent_arc_id` convention to a first-class field.

If you adopt the Protocol, [tell us about it](https://github.com/joethefisher/agent-arc-status/issues/new). The fastest way for a draft protocol to mature is to hear from real users.
