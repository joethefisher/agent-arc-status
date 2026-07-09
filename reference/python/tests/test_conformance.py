"""Run the shared, language-agnostic conformance corpus against the Python
reference. This is the same corpus the Node runner checks; agreement is the
cross-language interoperability evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from agent_arc_status import validate, validate_sequence

CONF_DIR = Path(__file__).resolve().parents[3] / "conformance"


def _load_cases() -> list[dict[str, Any]]:
    manifest = json.loads((CONF_DIR / "manifest.json").read_text())
    cases: list[dict[str, Any]] = []
    for entry in manifest["files"]:
        cases.extend(json.loads((CONF_DIR / entry["file"]).read_text()))
    return cases


def test_reference_agrees_with_every_declared_verdict() -> None:
    failures: list[str] = []
    total = 0
    for c in _load_cases():
        total += 1
        if "event" in c:
            if (
                c.get("validator_valid") is not None
                and validate(c["event"]).ok != c["validator_valid"]
            ):
                failures.append(f"{c['id']}: validator_valid")
        else:
            opts = c.get("options") or {}
            res = validate_sequence(
                c["events"],
                partial=opts.get("partial", False),
                check_monotonic_sent_at=opts.get("checkMonotonicSentAt", False),
            )
            if res.ok != c["sequence_valid"]:
                failures.append(f"{c['id']}: sequence_valid")
            if c.get("issue_index") is not None:
                first = res.issues[0].index if res.issues else None
                if first != c["issue_index"]:
                    failures.append(f"{c['id']}: issue_index")

    assert failures == [], failures
    assert total >= 70
