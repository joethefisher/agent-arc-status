import { describe, it, expect } from "vitest";
import { run, type CliIO } from "../src/cli.js";

const STARTED = '{"arc_id":"a","phase":"started","title":"build atlas","sent_at":"2026-06-14T09:00:00Z"}';
const DONE = '{"arc_id":"a","phase":"done","title":"shipped","sent_at":"2026-06-14T09:10:00Z"}';

function fakeIo(opts: { stdin?: string; files?: Record<string, string> } = {}) {
  const outBuf: string[] = [];
  const errBuf: string[] = [];
  const io: CliIO = {
    stdout: (t) => outBuf.push(t),
    stderr: (t) => errBuf.push(t),
    readStdin: async () => opts.stdin ?? "",
    readFile: async (p) => {
      const f = opts.files?.[p];
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
    now: () => 0,
    isTty: false,
    env: {},
  };
  return { io, out: () => outBuf.join(""), err: () => errBuf.join("") };
}

describe("render", () => {
  it("renders each event to a line (no color when piped)", async () => {
    const { io, out } = fakeIo({ stdin: `${STARTED}\n${DONE}` });
    const code = await run(["render", "-"], io);
    expect(code).toBe(0);
    expect(out()).toBe("▶ build atlas\n■ shipped\n");
  });

  it("reports parse errors and exits 1", async () => {
    const { io, err } = fakeIo({ stdin: `not json\n${STARTED}` });
    const code = await run(["render", "-"], io);
    expect(code).toBe(1);
    expect(err()).toContain("line 0");
  });

  it("returns exit 3 when the file cannot be read", async () => {
    const { io } = fakeIo({});
    const code = await run(["render", "missing.jsonl"], io);
    expect(code).toBe(3);
  });
});

describe("validate", () => {
  it("exits 0 on a complete valid arc", async () => {
    const { io, out } = fakeIo({ stdin: `${STARTED}\n${DONE}` });
    const code = await run(["validate", "-"], io);
    expect(code).toBe(0);
    expect(out()).toContain("ok:");
  });

  it("exits 1 when an arc has no terminal, and 0 with --partial", async () => {
    const complete = fakeIo({ stdin: STARTED });
    expect(await run(["validate", "-"], complete.io)).toBe(1);

    const partial = fakeIo({ stdin: STARTED });
    expect(await run(["validate", "--partial", "-"], partial.io)).toBe(0);
  });
});

describe("tree", () => {
  it("indents a child arc under its parent via x_parent_arc_id", async () => {
    const root = `{"arc_id":"root","phase":"started","title":"migration","sent_at":"2026-06-14T09:00:00Z"}
{"arc_id":"root","phase":"done","title":"migration done","sent_at":"2026-06-14T09:30:00Z"}`;
    const child = `{"arc_id":"child","phase":"started","title":"backfill","sent_at":"2026-06-14T09:05:00Z","x_parent_arc_id":"root"}
{"arc_id":"child","phase":"done","title":"backfill done","sent_at":"2026-06-14T09:20:00Z"}`;
    const { io, out } = fakeIo({ stdin: `${root}\n${child}` });
    const code = await run(["tree", "-"], io);
    expect(code).toBe(0);
    const lines = out().trimEnd().split("\n");
    expect(lines[0]).toBe("■ migration  (done)");
    expect(lines[1]).toBe("  ■ backfill  (done)");
  });
});

describe("dispatch", () => {
  it("prints help for --help (exit 0) and errors on unknown (exit 2)", async () => {
    const help = fakeIo({});
    expect(await run(["--help"], help.io)).toBe(0);
    expect(help.out()).toContain("arc-status");

    const bad = fakeIo({});
    expect(await run(["frobnicate"], bad.io)).toBe(2);
    expect(bad.err()).toContain("unknown command");
  });
});
