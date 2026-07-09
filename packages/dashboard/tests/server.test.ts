import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { startDashboard, type RunningDashboard } from "../src/server.js";

const EVENT = '{"arc_id":"a","phase":"milestone","title":"receiver booted","step":6,"total":11,"sent_at":"2026-06-14T09:00:00Z"}';

let running: RunningDashboard | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function firstSseFrame(url: string): Promise<string> {
  const res = await fetch(url + "/events");
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe("dashboard server", () => {
  it("ingests a valid event (202) and exposes it in the SSE snapshot", async () => {
    running = await startDashboard({ port: 0 });
    const res = await fetch(running.url + "/ingest", { method: "POST", body: EVENT });
    expect(res.status).toBe(202);

    const frame = await firstSseFrame(running.url);
    expect(frame).toContain("event: snapshot");
    expect(frame).toContain('"arc_id":"a"');
    expect(frame).toContain('"status":"active"');
  });

  it("rejects an invalid event with 400 + issues", async () => {
    running = await startDashboard({ port: 0 });
    const res = await fetch(running.url + "/ingest", { method: "POST", body: '{"phase":"nope"}' });
    expect(res.status).toBe(400);
    const parsed = (await res.json()) as { issues: unknown[] };
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("rejects an oversized body with 413", async () => {
    running = await startDashboard({ port: 0, maxBodyBytes: 64 });
    const res = await fetch(running.url + "/ingest", { method: "POST", body: "x".repeat(500) });
    expect(res.status).toBe(413);
  });

  it("serves the static page with a CSP header", async () => {
    running = await startDashboard({ port: 0 });
    const res = await fetch(running.url + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    await res.text();
  });

  it("enforces HMAC on /ingest when a secret is configured", async () => {
    const secret = "s3cret";
    running = await startDashboard({ port: 0, hmacSecret: secret });

    const unsigned = await fetch(running.url + "/ingest", { method: "POST", body: EVENT });
    expect(unsigned.status).toBe(401);

    const sig = "sha256=" + createHmac("sha256", secret).update(EVENT).digest("hex");
    const signed = await fetch(running.url + "/ingest", {
      method: "POST",
      body: EVENT,
      headers: { "X-Webhook-Signature": sig },
    });
    expect(signed.status).toBe(202);
  });
});
