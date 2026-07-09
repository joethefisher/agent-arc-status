# @agent-arc-status/conformance

The **Node** conformance runner for the Agent Arc Status Protocol. It loads the language-agnostic
corpus in [`conformance/`](../../conformance/) and asserts the [reference
implementation](../reference/) agrees with every declared verdict:

- `schema_valid` — against `spec/schema.json` compiled with stock ajv (no plugins),
- `validator_valid` — against `validate()`,
- `sequence_valid` — against `validateSequence()`,
- `issue_index` — (strict mode) the first reported sequence issue.

It also verifies each corpus file's `sha256` against `manifest.json` to catch un-regenerated edits.

This package is **private** (not published); it is the reference's self-check and the Node half of
the cross-language interoperability gate. The Python half lives at
`conformance/runners/python/run_conformance.py`.

## Run

```bash
npm run -w @agent-arc-status/conformance build
node packages/conformance/dist/run.js     # exits non-zero on any mismatch
```

It also runs under the repo's `npm test` via `tests/conformance.test.ts`.
