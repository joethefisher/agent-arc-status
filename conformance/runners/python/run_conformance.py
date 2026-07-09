#!/usr/bin/env python3
"""Python conformance runner for the Agent Arc Status Protocol.

Loads the language-agnostic corpus under ``conformance/`` and asserts the Python
reference (``agent_arc_status``) agrees with every declared verdict. Passing this
against the same corpus the Node runner passes is the cross-language
interoperability demonstration (spec sections 10 and 12).

``validator_valid`` and ``sequence_valid`` are always checked (zero-dependency).
``schema_valid`` is additionally checked when ``jsonschema`` is importable (the
dev/test extra), mirroring the Node runner's ajv check.

Usage: python conformance/runners/python/run_conformance.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from agent_arc_status import validate, validate_sequence

CONF_DIR = Path(__file__).resolve().parents[2]
SCHEMA_PATH = CONF_DIR.parent / "spec" / "schema.json"

try:
    from jsonschema import Draft202012Validator

    _schema = json.loads(SCHEMA_PATH.read_text())
    _schema_validator = Draft202012Validator(_schema)
    HAVE_JSONSCHEMA = True
except Exception:  # noqa: BLE001 - jsonschema is an optional dev extra
    HAVE_JSONSCHEMA = False


def main() -> int:
    manifest = json.loads((CONF_DIR / "manifest.json").read_text())
    failures: list[str] = []
    total = 0

    for entry in manifest["files"]:
        cases = json.loads((CONF_DIR / entry["file"]).read_text())
        for c in cases:
            total += 1
            if "event" in c:
                if c.get("validator_valid") is not None:
                    got = validate(c["event"]).ok
                    if got != c["validator_valid"]:
                        failures.append(
                            f"{c['id']}: validator_valid expected {c['validator_valid']}, got {got}"
                        )
                if HAVE_JSONSCHEMA and c.get("schema_valid") is not None:
                    got = _schema_validator.is_valid(c["event"])
                    if got != c["schema_valid"]:
                        failures.append(
                            f"{c['id']}: schema_valid expected {c['schema_valid']}, got {got}"
                        )
            else:
                opts = c.get("options") or {}
                res = validate_sequence(
                    c["events"],
                    partial=opts.get("partial", False),
                    check_monotonic_sent_at=opts.get("checkMonotonicSentAt", False),
                )
                if res.ok != c["sequence_valid"]:
                    failures.append(
                        f"{c['id']}: sequence_valid expected {c['sequence_valid']}, got {res.ok}"
                    )
                if c.get("issue_index") is not None:
                    first = res.issues[0].index if res.issues else None
                    if first != c["issue_index"]:
                        failures.append(
                            f"{c['id']}: issue_index expected {c['issue_index']}, got {first}"
                        )

    for f in failures:
        print(f"FAIL  {f}", file=sys.stderr)

    label = "with jsonschema" if HAVE_JSONSCHEMA else "validator+sequence only"
    print(f"conformance (python, {label}): {total - len(failures)}/{total} cases passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
