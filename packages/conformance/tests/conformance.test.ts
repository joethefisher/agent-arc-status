import { describe, it, expect } from "vitest";
import { runCorpus } from "../src/index.js";

describe("conformance corpus (node reference)", () => {
  const result = runCorpus();

  it("has no manifest sha256 drift", () => {
    expect(result.driftErrors).toEqual([]);
  });

  it("the reference agrees with every declared verdict", () => {
    // Surface the specific mismatches if any, then assert none.
    if (result.failures.length > 0) {
      console.error(JSON.stringify(result.failures, null, 2));
    }
    expect(result.failures).toEqual([]);
  });

  it("exercises a meaningful number of cases", () => {
    expect(result.total).toBeGreaterThanOrEqual(70);
  });
});
