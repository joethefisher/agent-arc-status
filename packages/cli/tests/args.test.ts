import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("collects positionals and boolean flags", () => {
    const parsed = parseArgs(["render", "file.jsonl", "--json", "--no-color"]);
    expect(parsed.positional).toEqual(["render", "file.jsonl"]);
    expect(parsed.flags).toEqual({ json: true, "no-color": true });
  });

  it("does not let a boolean flag swallow the next positional", () => {
    const parsed = parseArgs(["file.jsonl", "--follow"]);
    expect(parsed.positional).toEqual(["file.jsonl"]);
    expect(parsed.flags).toEqual({ follow: true });
  });

  it("consumes a value only for declared value-flags", () => {
    const parsed = parseArgs(["--port", "8787", "--host", "127.0.0.1"], new Set(["port", "host"]));
    expect(parsed.flags).toEqual({ port: "8787", host: "127.0.0.1" });
    expect(parsed.positional).toEqual([]);
  });

  it("supports --key=value and treats - as a positional", () => {
    const parsed = parseArgs(["--port=9000", "-"], new Set(["port"]));
    expect(parsed.flags["port"]).toBe("9000");
    expect(parsed.positional).toEqual(["-"]);
  });
});
