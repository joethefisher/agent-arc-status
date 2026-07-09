# Agent Arc Status Protocol — conformance suite

A **language-agnostic** corpus of test cases for the Agent Arc Status Protocol. It is modeled
on the [JSON Schema Test Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite): a set
of checked-in JSON files, each pairing an input with its expected verdict, that any implementation
consumes with its own small runner. Two implementations agreeing on the same corpus is the
Protocol's [interoperability](../spec/v0.2.md#10-versioning) evidence — the gate for v1.0.

## Layout

```
conformance/
  manifest.json          # version, per-file case counts + sha256 drift guard
  schema/case.schema.json# JSON Schema describing a case file
  single-event/          # one-event cases (schema validity + field constraints)
    valid.json  schema-invalid.json  field-constraints.json  extensions.json  divergences.json
  sequence/              # phase-legality cases (§4.5–§4.6)
    valid.json  phase-ordering.json  blocked-rules.json  options.json
  examples/streams.json  # the five canonical example streams as valid sequences
  scripts/generate-corpus.mjs   # regenerates the corpus deterministically
  runners/python/        # Python runner (mirrors packages/conformance for Node)
```

Each corpus file is a JSON array of cases. A **single-event case** carries an `event` plus
`schema_valid` and `validator_valid`; a **sequence case** carries `events` plus `sequence_valid`
(and optional `options` / `issue_index`). See [`schema/case.schema.json`](schema/case.schema.json).

## The two verdicts (why there are two)

A single-event case declares **both** verdicts because the Protocol has two conformance surfaces
that occasionally disagree by design:

- `schema_valid` — what a **stateless JSON Schema validator** says about [`spec/schema.json`](../spec/schema.json).
- `validator_valid` — what a **full validator** (the reference `validate()`) says.

They differ on exactly two documented cases (see the schema's `$comment`): `step > total`, and
calendar-impossible dates like `2026-02-30`. JSON Schema 2020-12 cannot express a cross-field rule
or per-month day bounds, so the schema **accepts** these while a full validator **rejects** them.
Keeping the two columns separate means a schema-only implementation is judged against `schema_valid`
and is **not unfairly failed** on those divergences, while a full implementation must also agree
with `validator_valid`. (`conformance/single-event/divergences.json` holds these cases.)

## What this suite can and cannot assert (spec §6)

The Protocol's conformance model has two tiers. This corpus is honest about which it covers:

**✅ Asserts — machine-verifiable (provable from payloads):**
1. **Schema validity** — every event's `schema_valid` / `validator_valid` verdict.
2. **Phase legality** — per-arc ordering rules (`sequence_valid`): start-with-`started`,
   terminal-last, at-most-one-`done`, no-events-after-`done`, legal `blocked` resumes, and
   no consecutive `blocked` (§4.5–§4.6).

**❌ Does NOT assert — operational (cannot be proven from a fixed corpus):**
3. **Cadence backstop** (§5.2) — requires per-event *receipt* timestamps and a configured silence
   window; it cannot be judged from payloads alone. (The reference ships this discipline as code —
   `CadenceController` / `SilenceWatchdog` — with its own unit tests.)
4. **Unique `arc_id`** (§6.4) — requires observing many arcs; a fixed corpus cannot falsify a
   "globally unique" claim.
5. **Honest `done`** (§6.5) — whether a `done` reflects a truly finished deliverable has no
   payload-observable proxy; it is an operational discipline, not a mechanical check.

A conformance rule a third party cannot check is a wish, not a contract — so this suite claims only
what it can prove.

## Running it

- **Node reference:** `node packages/conformance/dist/run.js` (also runs under `npm test` via
  `packages/conformance/tests/conformance.test.ts`).
- **Python reference:** `python conformance/runners/python/run_conformance.py`.

Both runners load this corpus and assert their implementation matches every declared verdict.
The `conformance` CI job runs both and blocks release on disagreement.

## Regenerating

The corpus is checked in as static JSON. To reproduce it (e.g. after adding cases), edit
[`scripts/generate-corpus.mjs`](scripts/generate-corpus.mjs) and run:

```bash
node conformance/scripts/generate-corpus.mjs
```

This rewrites the case files and `manifest.json` (with fresh sha256s). The runners verify those
sha256s, so an edited case that wasn't regenerated is caught as drift.
