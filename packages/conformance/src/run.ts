#!/usr/bin/env node
/**
 * CLI entry: run the conformance corpus against the Node reference and exit
 * non-zero on any failure or manifest drift. Used by the `conformance` CI job.
 */

import { runCorpus } from "./index.js";

const result = runCorpus();

for (const d of result.driftErrors) console.error(`DRIFT ${d}`);
for (const f of result.failures) console.error(`FAIL  ${f.id}: ${f.reason}`);

console.log(
  `conformance (node): ${result.passed}/${result.total} cases passed across ${result.filesChecked} files`,
);

if (result.failures.length > 0 || result.driftErrors.length > 0) {
  process.exit(1);
}
