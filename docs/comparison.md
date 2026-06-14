# Comparison with adjacent systems

The Agent Arc Status Protocol fills a specific gap. It is not a competitor to most of the tools listed below — most of them solve adjacent problems and can be used alongside the Protocol. This document exists so you can place the Protocol in your existing mental map and know when to reach for it versus something else.

## Quick decision matrix

| You want to... | Use |
|---|---|
| Tell another agent / a human "this long-running arc is still alive" | **Agent Arc Status Protocol** |
| Trace a distributed request across services | OpenTelemetry |
| Debug what an LLM-driven agent did internally | LangSmith / LangFuse / framework-native observability |
| Orchestrate a multi-step workflow with retry semantics | Inngest / Temporal / Airflow |
| Connect an LLM to tools and external data | MCP |
| Delegate a task to another agent / discover an agent's capabilities | A2A (Agent2Agent) |
| Push CRM events to other SaaS tools | Generic webhooks (Svix, Hookdeck) |
| Fan out arc-status events to multiple consumers | Generic webhook bus + Agent Arc Status Protocol |

## OpenTelemetry

**What it is:** A standard for distributed tracing, metrics, and logs in distributed systems. Spans model request lifecycles end-to-end.

**Why it doesn't solve the silence problem:** OTel spans have a fixed lifecycle — they start, possibly emit child spans, and end with a status (`OK`, `ERROR`, `UNSET`). There is no first-class notion of *progress reporting from inside a long-running span*. OTel was designed for sub-second to single-digit-second spans, not for multi-hour autonomous work.

**How they compose:** An arc MAY contain one or more OTel traces. The `arc_id` MAY be carried as an OTel span attribute (e.g. `agent.arc.id`) for correlation. A consumer of arc-status events can use the `arc_id` to drill into the underlying trace when more detail is needed.

**When to use which:**
- "What latency did this API call have?" → OTel.
- "Is this 4-hour build still alive?" → Arc Status Protocol.
- Both at once if you want both views.

## LangSmith / LangFuse / framework observability

**What they are:** Observability platforms purpose-built for LLM-driven applications. They capture every prompt, completion, tool call, and chain step, with a UI for inspecting and debugging.

**Why they don't solve the silence problem:** They're optimized for *retrospective debugging*, not real-time progress to external consumers. Pulling progress out of LangSmith into a non-LangChain consumer requires custom integration. They're also vendor-coupled — adopting them means committing your observability layer to one platform.

**How they compose:** A LangChain agent using LangSmith for internal observability can additionally emit arc-status events at human-meaningful boundaries. LangSmith holds the detailed trace; the arc-status stream holds the progress headline.

**When to use which:**
- "What prompt did the agent send on step 7?" → LangSmith.
- "Has the agent shipped the deliverable yet?" → Arc Status Protocol.

## Workflow engines (Inngest, Temporal, Airflow)

**What they are:** Durable execution platforms with first-class step semantics, retries, sleep, and state machines.

**Why they don't solve the silence problem alone:** Workflow engines have rich internal progress models, but those models are only available to consumers who are *inside* the engine. An external observer (a Slack channel, a Telegram bot, a parent agent) sees nothing unless the workflow explicitly emits something.

**How they compose:** A workflow step can emit arc-status events to a separate consumer. The workflow engine handles orchestration; the Protocol handles external visibility.

**When to use which:**
- "I need at-least-once execution of a multi-step pipeline." → Workflow engine.
- "I need humans (or other agents) outside the engine to see progress." → Arc Status Protocol on top.

## MCP (Model Context Protocol)

**What it is:** A protocol for connecting LLMs to tools, data, and capabilities.

**Why it's not the same problem:** MCP standardizes *how an LLM invokes a capability and gets a result back*. It does not standardize *how a long-running capability reports progress while it's executing*. An MCP tool that takes an hour to run is silent from MCP's perspective until it returns.

**How they compose:** An MCP tool MAY emit arc-status events to a separate channel during execution. The MCP response carries the final result; the arc-status stream carries the progress narrative.

**When to use which:**
- "How does my agent invoke a tool?" → MCP.
- "How does my long-running tool tell the world it's making progress?" → Arc Status Protocol.

## A2A (Agent2Agent Protocol)

**What it is:** A cross-vendor protocol for agents to discover one another (capability cards), delegate tasks, and exchange messages about those tasks. Announced by Google in 2025 and governed under the Linux Foundation.

**Why it's not the same problem:** A2A standardizes *how one agent hands a task to another and converses about it*. It does not standardize the in-flight liveness/progress signal a long-running delegated task emits *while it executes* — from A2A's vantage a task is a request/response with messages, not a cadence-disciplined progress stream a human or dashboard watches.

**How they compose:** An A2A Task MAY carry an `arc_id`; the delegate emits arc-status events that the delegator (or a human console) consumes to know the delegated work is alive and moving. A2A moves the work between agents; the Arc Status Protocol reports its progress.

**When to use which:**
- "How does Agent A delegate to and discover Agent B?" → A2A.
- "Is the work A delegated to B still alive and moving?" → Arc Status Protocol.

## Generic webhook platforms (Svix, Hookdeck, Inngest webhooks)

**What they are:** Infrastructure for reliable webhook delivery — retries, signatures, replay, dashboards.

**Why they're not a substitute:** Svix and Hookdeck deliver any payload, including arc-status events. They don't define the vocabulary, the phases, the cadence rule, or the silence backstop. They are the *plumbing*; the Protocol is the *language*.

**How they compose:** Svix is a natural transport for the Protocol's HTTP binding (§8.1). Configure Svix to deliver `arc.status` events to your consumers. The Protocol tells you what to put in the body and when to send it.

**When to use which:**
- "I need reliable HTTP fan-out infrastructure." → Svix or similar.
- "I need a portable vocabulary for in-progress agent work." → Arc Status Protocol.
- Use both together for a production deployment.

## Status pages (Statuspage, BetterStack)

**What they are:** Hosted services for displaying system status to end users.

**Why they're not the same problem:** Status pages model component-level health (up/down/degraded), not in-progress work. They are for "is the service up?" not "is this job making progress?"

**How they compose:** A status page can subscribe to arc-status events and render an in-progress arc as a transient incident or progress bar.

## Frameworks with built-in progress (Streamlit, Gradio, OpenAI Assistants progress)

**What they are:** UI frameworks or hosted-agent products with their own progress conventions baked in.

**Why they're not portable:** Each one has a different convention. Migrating an arc from Streamlit to Gradio to your own dashboard requires rewriting every emission site. The Protocol exists so progress is portable across these surfaces.

**How they compose:** A Streamlit app can render arc-status events using Streamlit's own progress widgets while the events themselves are emitted to a backend that any future surface can consume.

## Summary

The Protocol's niche is narrow and clear:

- **Vocabulary, not platform.** It defines what to say, not where to send it.
- **In-progress work, not retrospective traces.** It complements OTel and LangSmith.
- **External consumers, not internal orchestration.** It complements workflow engines.
- **Cross-framework portability, not single-vendor lock-in.** It complements (and sometimes replaces) framework-native progress surfaces.

If your problem is on the right side of the slash in any of those pairings, reach for the corresponding tool. If your problem is on the left side, the Protocol is what you're looking for.
