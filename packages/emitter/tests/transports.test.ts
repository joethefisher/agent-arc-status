import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { httpTransport, stdoutTransport } from "../src/index.js";
import type { ArcStatusEvent } from "@agent-arc-status/reference";

const event: ArcStatusEvent = {
  arc_id: "a",
  phase: "milestone",
  title: "receiver booted",
  sent_at: "2026-06-14T09:00:00Z",
};

describe("stdoutTransport", () => {
  it("writes one JSON line per event", async () => {
    const lines: string[] = [];
    const transport = stdoutTransport({ write: (line) => lines.push(line) });
    await transport.send(event);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.trim())).toEqual(event);
  });
});

describe("httpTransport", () => {
  it("sends the webhook binding headers and an HMAC signature", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 202 } as Response;
    }) as unknown as typeof fetch;

    const transport = httpTransport({
      url: "http://127.0.0.1/hook",
      secret: "s3cret",
      fetch: fakeFetch,
    });
    await transport.send(event);

    const { init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Webhook-Event-Type"]).toBe("arc.status");
    expect(headers["X-Webhook-Delivery-Id"]).toBeTruthy();
    const expected = "sha256=" + createHmac("sha256", "s3cret").update(init.body as string).digest("hex");
    expect(headers["X-Webhook-Signature"]).toBe(expected);
  });

  it("rejects on a non-2xx response", async () => {
    const fakeFetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const transport = httpTransport({ url: "http://127.0.0.1/hook", fetch: fakeFetch });
    await expect(transport.send(event)).rejects.toThrow(/HTTP 500/);
  });
});
