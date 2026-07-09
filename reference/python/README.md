# agent-arc-status (Python reference)

A faithful, **zero-dependency** Python implementation of the
[Agent Arc Status Protocol](https://github.com/joethefisher/agent-arc-status) — the same
types, validator, renderer, cadence, and state-reduction surface as the
[TypeScript reference](https://github.com/joethefisher/agent-arc-status/tree/main/packages/reference),
with Pythonic snake_case names. It passes the shared, language-agnostic
[conformance corpus](https://github.com/joethefisher/agent-arc-status/tree/main/conformance),
which is the Protocol's cross-language interoperability evidence.

Implements protocol **v0.2**.

## Install

```bash
pip install agent-arc-status
```

## Use

```python
from agent_arc_status import validate, validate_sequence, render, reduce_arc

event = {
    "arc_id": "018f9c31-7e40-7a2b-9c00-0000000000a1",
    "phase": "milestone",
    "title": "receiver booted",
    "step": 6,
    "total": 11,
    "eta_minutes": 25,
    "sent_at": "2026-06-14T09:00:00Z",
}

result = validate(event)
if result.ok:
    print(render(result.event))     # "✓ [6/11] receiver booted (ETA 25m)"
else:
    print(result.issues)

# Fold a stream into current state:
state = reduce_arc([started, milestone, done])   # ArcState | None

# Validate phase ordering for one arc:
seq = validate_sequence([started, milestone, done])   # seq.ok, seq.issues
```

The API mirrors the TypeScript reference one-to-one:

| TypeScript | Python |
|---|---|
| `validate(e)` → `{ok, event}` \| `{ok, issues}` | `validate(e)` → `ValidationOk` \| `ValidationErr` |
| `validateSequence(events, {partial})` | `validate_sequence(events, *, partial=..., check_monotonic_sent_at=...)` |
| `parse` / `parseJsonl` | `parse` / `parse_jsonl` |
| `render(e, {bodyMax})` | `render(e, *, body_max=...)` |
| `reduceArc(events)` | `reduce_arc(events)` |
| `CadenceController` / `SilenceWatchdog` | same, snake_case methods |
| `RFC3339_PATTERN`, `PROTOCOL_VERSION` | same |

## Develop

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
ruff check . && ruff format --check .
mypy
pytest
```

Zero runtime dependencies; `jsonschema` is used only in the dev/test extra to prove the
validator agrees with `spec/schema.json`.
