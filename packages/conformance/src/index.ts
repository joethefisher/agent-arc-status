/**
 * Conformance runner for the Agent Arc Status Protocol (Node reference).
 *
 * Loads the language-agnostic corpus under `conformance/` and checks that the
 * reference implementation's verdicts match every case's declared expectations:
 *   - `schema_valid`    vs the canonical JSON Schema compiled under stock ajv
 *   - `validator_valid` vs the reference `validate()`
 *   - `sequence_valid`  vs the reference `validateSequence()`
 *   - `issue_index`     (strict mode) vs the first reported sequence issue
 *
 * A second-language implementation passing this same corpus with its own runner
 * is the cross-language interoperability demonstration (spec §10, §12).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  validate,
  validateSequence,
  type ArcStatusEvent,
  type SequenceOptions,
} from "@agent-arc-status/reference";

const here = dirname(fileURLToPath(import.meta.url));

/** Repo-root `conformance/` directory (works from both src/ and dist/). */
export const CORPUS_DIR = resolve(here, "../../../conformance");
const SCHEMA_PATH = resolve(CORPUS_DIR, "../spec/schema.json");

// ajv ships CJS and puts the class on `.default`; under real-node ESM a default
// import is the module object (not constructable). createRequire loads it
// correctly for both `tsc` and `node dist/run.js`.
const nodeRequire = createRequire(import.meta.url);
const Ajv2020 = nodeRequire("ajv/dist/2020.js").default as new (opts?: {
  allErrors?: boolean;
}) => { compile: (schema: unknown) => (data: unknown) => boolean };

interface EventCase {
  id: string;
  description: string;
  event: unknown;
  schema_valid?: boolean;
  validator_valid?: boolean;
}

interface SequenceCase {
  id: string;
  description: string;
  events: ArcStatusEvent[];
  options?: SequenceOptions;
  sequence_valid: boolean;
  issue_index?: number;
}

type Case = EventCase | SequenceCase;

export interface CaseFailure {
  id: string;
  reason: string;
}

export interface CorpusResult {
  total: number;
  passed: number;
  filesChecked: number;
  failures: CaseFailure[];
  driftErrors: string[];
}

export interface RunOptions {
  /** Also assert the first reported sequence issue index. Default: true. */
  strict?: boolean;
}

function isEventCase(c: Case): c is EventCase {
  return "event" in c;
}

export function runCorpus(options: RunOptions = {}): CorpusResult {
  const strict = options.strict ?? true;

  const manifest = JSON.parse(
    readFileSync(resolve(CORPUS_DIR, "manifest.json"), "utf8"),
  ) as { files: Array<{ file: string; cases: number; sha256: string }> };

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true });
  const ajvValidate = ajv.compile(schema);

  const failures: CaseFailure[] = [];
  const driftErrors: string[] = [];
  let total = 0;

  for (const entry of manifest.files) {
    const raw = readFileSync(resolve(CORPUS_DIR, entry.file), "utf8");
    const sha = createHash("sha256").update(raw).digest("hex");
    if (sha !== entry.sha256) {
      driftErrors.push(
        `${entry.file}: sha256 mismatch — corpus edited without regenerating the manifest`,
      );
    }

    const cases = JSON.parse(raw) as Case[];
    for (const c of cases) {
      total++;
      if (isEventCase(c)) {
        if (c.schema_valid !== undefined) {
          const got = ajvValidate(c.event) === true;
          if (got !== c.schema_valid) {
            failures.push({
              id: c.id,
              reason: `schema_valid expected ${c.schema_valid}, got ${got}`,
            });
          }
        }
        if (c.validator_valid !== undefined) {
          const got = validate(c.event).ok;
          if (got !== c.validator_valid) {
            failures.push({
              id: c.id,
              reason: `validator_valid expected ${c.validator_valid}, got ${got}`,
            });
          }
        }
      } else {
        const res = validateSequence(c.events, c.options ?? {});
        if (res.ok !== c.sequence_valid) {
          failures.push({
            id: c.id,
            reason: `sequence_valid expected ${c.sequence_valid}, got ${res.ok}`,
          });
        }
        if (strict && c.issue_index !== undefined) {
          const firstIdx = res.issues[0]?.index;
          if (firstIdx !== c.issue_index) {
            failures.push({
              id: c.id,
              reason: `issue_index expected ${c.issue_index}, got ${String(firstIdx)}`,
            });
          }
        }
      }
    }
  }

  return {
    total,
    passed: total - failures.length,
    filesChecked: manifest.files.length,
    failures,
    driftErrors,
  };
}
