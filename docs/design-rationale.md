# Design rationale

This document records *why* the Protocol made specific design choices, for readers who need to extend, embed, or argue with the design. The [spec](../spec/v0.2.md) defines *what* the Protocol is; this document defines *why*.

## Why a protocol at all (instead of a library or a service)

The temptation, given the problem statement, is to ship a hosted service or a one-language library and call it a day. We rejected both for the same reason:

- **A hosted service** locks adopters into a vendor and creates a centralization point that doesn't need to exist. Progress reporting is too cross-cutting to put behind any one company.
- **A one-language library** picks winners. Agents are built in Node, Python, Go, Rust, and inside framework-specific languages. A library for one of them is a library for none of the rest.

A protocol is the smallest unit that addresses the actual portability problem. The reference implementation exists because protocols without working code are unusable; but the spec, not the code, is the deliverable.

## Why JSON over a binary format

JSON is verbose, slow to parse at scale, and full of footguns. We picked it anyway:

- The event volume per arc is tiny. Even high-emission scenarios produce single-digit events per minute. The compression we'd buy by going binary is irrelevant.
- JSON is the lingua franca of webhooks, message queues, MCP, and observability platforms. A binary format would force every consumer to adopt a codec.
- JSON Schema is a mature ecosystem for validation. Reproducing this in a binary format would mean either inventing a schema language or carrying a typed IDL alongside the wire format.
- Human-readability is real. A developer copying an event out of a log into a Slack channel should be able to read it.

If high-volume binary serialization becomes a real constraint for any adopter, the JSON event shape maps 1:1 to a Protobuf message; the encoding decision is reversible.

## Why event-per-emission and not a single arc record that updates in place

An arc could be modeled as a single mutable record that updates as work progresses. We picked append-only events instead:

- Events compose with any transport. A mutable record requires a transport that supports updates (REST PATCH, queue with replace semantics) and loses the option of stdout / message queue / fanout.
- Multiple consumers can see the full timeline. With a mutable record, late-joining consumers see only the current state and lose the narrative.
- Events are idempotent under retry. A mutable record makes retry semantics hard ("did the update apply? am I about to overwrite a later state?").
- Append-only matches how humans think about progress. "What happened?" is a more useful question than "what is the current state?"

The cost is that consumers must reconstruct current state from the event stream. This is cheap (it's a fold over the events), and the reference implementation provides a helper — `reduceArc` — that folds an event stream into current arc state.

## Why `sent_at` instead of `started_at` and `duration`

We could have made events carry the arc-start time and a duration. Three reasons we didn't:

- Each event is self-contained. The `arc_id` threads them together when a consumer wants the full timeline.
- A start time per event would be redundant after the first; either consumers ignore it on later events (in which case why send it) or they trust it and we've duplicated state.
- `sent_at` is unambiguous: when the emitter generated this event. Anything else introduces clock-sync questions that aren't ours to solve.

## Why phase ordering is enforced

A naive read of the spec might suggest phases are advisory — emitters can fire whatever they want and consumers cope. We made phase ordering a conformance requirement because:

- Without enforcement, consumers must implement defensive logic for every illegal sequence. The cost of "be liberal in what you accept" is borne by every consumer; the cost of strict emission is borne once by the emitter author.
- Phase ordering carries semantic weight. A `done` followed by `milestone` is not a stylistic choice — it's nonsense. Allowing it would mean every consumer has to decide what nonsense means.
- The conformance suite (future) needs a clear "is this legal?" answer.

Phase-ordering and terminal rules are structurally enforced: `validateSequence` catches an arc that doesn't begin with `started`, doesn't end in a terminal event, or re-blocks without a resume. The cadence backstop and honest-`done`, by contrast, are *operational* rules a stateless validator cannot prove — the spec separates the two in §6's two-tier conformance, and we don't claim the validator enforces what it structurally can't. The cost to emitters is minimal: write the phases in the order the spec lists.

## Why no built-in correlation to external systems

The Protocol is bare-bones. It doesn't carry trace IDs, span IDs, customer IDs, or any cross-system correlator beyond `arc_id` itself. We picked this floor deliberately:

- Adopters have wildly different correlation needs. Some want OTel trace IDs; some want Stripe customer IDs; some want internal account UUIDs. Picking one set of standard correlators would alienate the rest.
- The `x_` extension namespace lets adopters add whatever correlators they need without spec changes.
- The Protocol's job is to make progress reportable. The correlation layer is a separate concern.

## Why default to MIT license

The Protocol is meant to be embedded. A copyleft license (GPL family) would create friction for commercial adoption; a custom license would create friction for any adopter who has to get it reviewed. MIT is the lowest-friction option that preserves attribution.

## Why publish a single language reference instead of three

A Node reference exists because the authoring system is Node. A Python reference is planned because Python is the second-largest agent ecosystem. Beyond that, we'd rather see adopters write language-native implementations than maintain a sprawling polyglot reference. The schema and the spec are the source of truth; reference implementations exist to demonstrate feasibility, not to be the only implementations.

## What would change our minds

The Protocol is a draft. The design decisions above are defensible today but contingent. We would revisit if:

- Adopters consistently report that 5 phases is too few or too many for real workloads.
- A meaningful binary-format constraint appears (e.g. high-volume emitters where JSON parsing is a real bottleneck).
- Sub-arc / parent-arc relationships turn out to be common enough that flat `arc_id` is a friction.
- A pattern emerges across adopters for cross-system correlation that warrants standardization.

The path to a v0.2 revision is through the [issue tracker](https://github.com/joethefisher/agent-arc-status/issues) and PRs against the spec.
