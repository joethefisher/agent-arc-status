# Changelog

All notable changes to the Agent Arc Status Protocol and reference implementation are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The spec and the reference implementation are versioned together (both at v0.2.0). Once they diverge in version, this changelog will distinguish them per release.

## [0.2.0] - 2026-06-14

This release hardens the draft against a pre-publication review. Several changes are breaking; because the Protocol is still a pre-1.0 draft, they ship as a minor per the [versioning policy](spec/v0.2.md#10-versioning). See **Migration** below.

### Added

- Cadence discipline as code: `CadenceController` and `SilenceWatchdog` in the reference implementation drive the silence backstop and cadence-floor gating (previously prose-only).
- `reduceArc`, a helper that folds an event stream into current arc state.
- `validateSequence` options: `{ partial }` (validate an in-flight prefix) and `{ checkMonotonicSentAt }` (opt-in emission-order check).
- `SECURITY.md` and `CODE_OF_CONDUCT.md`.
- A self-contained RFC 3339 `pattern` on `sent_at`, shared byte-for-byte with the reference validator and pinned by a drift-guard test.

### Changed / Fixed

- The published schema is now self-contained: it compiles under any standard JSON Schema validator with no plugins (previously threw on `format: date-time` under default-strict ajv).
- `validateSequence` now enforces the §4.6 terminal-event rule and rejects consecutive `blocked` events (§4.5); its docstring no longer overstates what it checks.
- Timestamps: one canonical grammar across schema, validator, and spec prose; calendar-impossible dates (e.g. `2026-02-30`) are rejected.
- `title`: a uniform 1–200 character, no-newline rule in both schema and validator.
- The `x_` extension namespace is enforced (`additionalProperties: false` + `patternProperties`); unknown non-`x_` fields are rejected.
- `$id` points at a resolvable raw URL.
- `render`: clamps `bodyMax` and fixes the h/m rounding boundary.
- Example streams rewritten as fully synthetic content with conformant cadence.
- Removed the `a2a` / `agent-to-agent` npm keywords (they collide with Google's A2A protocol); added an A2A comparison instead.
- Fixed the git-install command and added a `prepare` build step so a git dependency ships a built `dist/`.
- Dropped the `ajv-formats` dev dependency (the schema no longer needs it).

### Migration (breaking)

- A `title` longer than 200 characters or containing a newline is now invalid (was 500 / newline validator-only).
- Events carrying unknown non-`x_` fields are now invalid; use the `x_` prefix.
- `validateSequence` now rejects an arc that does not end in `done` or terminal `blocked`; pass `{ partial: true }` to validate an in-flight prefix.
- Calendar-impossible `sent_at` values are now rejected.

## [0.1.0] - 2026-06-13

### Added

- Initial draft of the Agent Arc Status Protocol specification ([`spec/v0.2.md`](spec/v0.2.md))
- JSON Schema for `arc.status` events ([`spec/schema.json`](spec/schema.json))
- TypeScript reference implementation ([`reference/node/`](reference/node/))
  - Types matching the wire schema
  - Structural validator (`validate`)
  - Sequence validator (`validateSequence`)
  - JSON and JSON Lines parsers (`parse`, `parseJsonl`)
  - Default human-line renderer (`render`)
  - Strict TypeScript, zero runtime dependencies
- Five example arc streams ([`examples/`](examples/)) covering short arcs, feature builds, long autonomous arcs, blocked-and-resumed arcs, and terminal-blocked arcs
- Motivation document ([`docs/motivation.md`](docs/motivation.md))
- Adoption guide ([`docs/adoption.md`](docs/adoption.md))
- Comparison with adjacent systems ([`docs/comparison.md`](docs/comparison.md))
- Design rationale ([`docs/design-rationale.md`](docs/design-rationale.md))
- MIT License
- Contribution guide ([`CONTRIBUTING.md`](CONTRIBUTING.md))

### Status

This is a **draft** release. The Protocol will reach v1.0 after at least one external implementation reports successful interoperability with the reference. Breaking changes between draft versions are possible; once we cut v1.0, the project follows the [versioning policy](spec/v0.2.md#10-versioning) in the spec.
