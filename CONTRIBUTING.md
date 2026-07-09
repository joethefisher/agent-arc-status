# Contributing to the Agent Arc Status Protocol

There are two kinds of contributions, and they have different processes.

## 1. Changes to the spec

The spec is normative. Changes to it can break adopters. We treat it like an RFC.

### What requires a spec change

- Adding, removing, or renaming a phase.
- Changing the wire format (field types, names, requirements).
- Changing the cadence rules (the 5-minute floor, the 20-minute silence window).
- Changing conformance rules for emitters or consumers.
- Changing the legal phase-ordering sequence.

### What does NOT require a spec change

- Adding a new transport binding (the existing list is RECOMMENDED, not exhaustive).
- Adding a new application-specific extension under the `x_` prefix.
- Adding a new reference implementation in another language.
- Adding documentation, examples, or comparison material.

### Process for spec changes

1. **Open an issue first** describing the problem and the proposed change. We want to discuss before you spend time writing.
2. **Wait for "ready for PR" tag** before opening the PR. This filters out non-starters.
3. **PR must include:**
   - The actual spec edit
   - A `CHANGELOG.md` entry
   - Updated examples if the change affects emission
   - Updated reference implementation + tests if the change affects validation or rendering
   - A justification under `docs/design-rationale.md` if the change reflects a design shift
4. **Adopter feedback is welcomed** when available. A comment from someone implementing the Protocol is a strong signal for a non-trivial change, though not a hard gate while the draft is young.

Minor revisions (editorial fixes, clarifications, schema tightening) ship as a patch (0.1.0 → 0.1.1). Additive changes ship as minor (0.1.x → 0.2.0). Breaking changes ship as major (0.x → 1.0).

## 2. Changes to the reference implementation, examples, or docs

These are normal software contributions and follow the usual flow:

1. Open an issue or jump to a PR. Your call.
2. Tests must pass and typecheck must be clean.
3. New behavior needs tests.
4. Renames and refactors are fine; we prefer them small.

### Reference impl development

```bash
# from the repo root (npm workspaces):
npm install
npm test
npm run typecheck
npm run build
```

The reference implementation must:

- Have zero runtime dependencies.
- Pass strict TypeScript checks.
- Have full test coverage of the validation rules.
- Round-trip the shipped example JSONL files cleanly.

## Style

- **Spec language:** use RFC 2119 keywords (MUST, SHOULD, MAY) only when stating normative requirements. Use plain English everywhere else.
- **Code style:** keep the reference implementation small and readable. We will reject clever code that obscures the protocol's semantics, even if it shaves bytes.
- **Documentation:** write to a reader who has never seen the project before. Assume technical literacy, not domain expertise.

## What we will reject

- Changes that grow the protocol surface without a concrete adopter problem driving them.
- Changes that couple the wire format to a specific transport.
- Changes that introduce vendor-specific concepts (vendor IDs, hosted-service URLs, etc.).
- Reference-impl changes that add runtime dependencies.
- PRs without tests for new behavior.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). In short: be direct, be respectful, attack ideas not people.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE) of the project.
