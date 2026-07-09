import { defineConfig } from "vitest/config";

// Single root config that discovers every workspace package's test suite.
// Each package keeps its tests under packages/<name>/tests/.
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
