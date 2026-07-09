import { describe, it, expect, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createArcServer } from "../src/commands/serve.js";
import type { CliIO } from "../src/cli.js";

const EVENT = '{"arc_id":"a","phase":"milestone","title":"receiver booted","sent_at":"2026-06-14T09:00:00Z"}';

function fakeIo() {
  const out: string[] = [];
  const io: CliIO = {
    stdout: (t) => out.push(t),
    stderr: () => {},
    readStdin: async () => "",
    readFile: async () => "",
    now: () => 0,
    isTty: false,
    env: {},
  };
  return { io, out };
}

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function listen(io: CliIO, maxBodyBytes?: number): Promise<string> {
  server = createArcServer(io, maxBodyBytes !== undefined ? { maxBodyBytes } : {});
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("createArcServer", () => {
  it("accepts a valid event (202) and renders it to stdout", async () => {
    const { io, out } = fakeIo();
    const url = await listen(io);
    const res = await fetch(url, { method: "POST", body: EVENT });
    expect(res.status).toBe(202);
    expect(out.join("")).toBe("✓ receiver booted\n");
  });

  it("rejects an invalid event with 400 + issues", async () => {
    const { io } = fakeIo();
    const url = await listen(io);
    const res = await fetch(url, { method: "POST", body: '{"phase":"nope"}' });
    expect(res.status).toBe(400);
    const parsed = (await res.json()) as { issues: unknown[] };
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("rejects an oversized body with 413", async () => {
    const { io } = fakeIo();
    const url = await listen(io, 64);
    const res = await fetch(url, { method: "POST", body: "x".repeat(500) });
    expect(res.status).toBe(413);
  });

  it("returns 405 for non-POST", async () => {
    const { io } = fakeIo();
    const url = await listen(io);
    const res = await fetch(url, { method: "GET" });
    expect(res.status).toBe(405);
  });
});
