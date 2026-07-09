import { createHmac, randomUUID } from "node:crypto";
import type { ArcStatusEvent } from "@agent-arc-status/reference";
import type { Transport } from "../transport.js";

export interface HttpTransportOptions {
  /** Webhook endpoint that receives `arc.status` events. */
  url: string;
  /** If set, sign the body with HMAC-SHA256 (spec §8.1 / §9.1). */
  secret?: string;
  /** Extra headers merged onto every request. */
  headers?: Record<string, string>;
  /** Injectable fetch for testing. Default: global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * HTTP webhook transport implementing the reference binding (spec §8.1):
 * `POST` with `X-Webhook-Event-Type: arc.status`, a per-delivery id, a
 * timestamp, and an optional HMAC-SHA256 signature. Rejects on non-2xx so the
 * emitter can route the failure to `onError`.
 */
export function httpTransport(options: HttpTransportOptions): Transport {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(event: ArcStatusEvent): Promise<void> {
      const body = JSON.stringify(event);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Event-Type": "arc.status",
        "X-Webhook-Delivery-Id": randomUUID(),
        "X-Webhook-Timestamp": new Date().toISOString(),
        ...options.headers,
      };
      if (options.secret !== undefined) {
        const signature = createHmac("sha256", options.secret).update(body).digest("hex");
        headers["X-Webhook-Signature"] = `sha256=${signature}`;
      }
      const response = await doFetch(options.url, { method: "POST", headers, body });
      if (!response.ok) {
        throw new Error(`arc.status transport: HTTP ${response.status}`);
      }
    },
  };
}
