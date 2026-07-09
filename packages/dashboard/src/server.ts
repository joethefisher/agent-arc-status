/**
 * A thin, zero-dependency dashboard server: validate untrusted webhook events,
 * fold them to arc state, and stream that state (as DATA, never HTML) to
 * browsers over SSE. The browser renders cards from JSON with textContent, so a
 * hostile `title`/`body` can never execute (spec §9.4). Binds 127.0.0.1 by
 * default; caps request bodies; optional HMAC-SHA256 on ingest.
 */

import { createServer as httpCreateServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type CadenceConfig } from "@agent-arc-status/reference";
import { ArcStore } from "./store.js";
import { SseHub } from "./sse.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const STATIC: Record<string, { file: string; type: string; csp?: boolean }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8", csp: true },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8", csp: true },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
};

export interface DashboardOptions {
  host?: string;
  port?: number;
  /** If set, require a valid HMAC-SHA256 `X-Webhook-Signature` on /ingest. */
  hmacSecret?: string;
  maxBodyBytes?: number;
  cadence?: CadenceConfig;
}

function readBody(
  req: import("node:http").IncomingMessage,
  maxBytes: number,
): Promise<{ body: string; tooBig: boolean }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) tooBig = true;
      else chunks.push(chunk);
    });
    req.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), tooBig }));
    req.on("error", () => resolve({ body: "", tooBig: false }));
  });
}

function signatureValid(secret: string, body: string, header: string | undefined): boolean {
  if (header === undefined) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function serveStatic(url: string, res: ServerResponse): Promise<void> {
  const entry = STATIC[url];
  if (entry === undefined) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const content = await readFile(join(PUBLIC_DIR, entry.file));
    const headers: Record<string, string> = { "content-type": entry.type };
    if (entry.csp) headers["content-security-policy"] = "default-src 'self'";
    res.writeHead(200, headers);
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end();
  }
}

export function createServer(options: DashboardOptions = {}): Server {
  const maxBody = options.maxBodyBytes ?? 65536;
  const store = new ArcStore();
  const hub = new SseHub();

  return httpCreateServer((req, res) => {
    void (async () => {
      const url = (req.url ?? "/").split("?")[0] ?? "/";
      const method = req.method ?? "GET";

      if (method === "POST" && url === "/ingest") {
        const { body, tooBig } = await readBody(req, maxBody);
        if (tooBig) {
          res.writeHead(413);
          res.end();
          return;
        }
        if (options.hmacSecret !== undefined) {
          const sig = req.headers["x-webhook-signature"];
          if (!signatureValid(options.hmacSecret, body, Array.isArray(sig) ? sig[0] : sig)) {
            res.writeHead(401);
            res.end();
            return;
          }
        }
        const result = parse(body);
        if (!result.ok) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ issues: result.issues }));
          return;
        }
        const state = store.append(result.event);
        hub.broadcast("event", state);
        res.writeHead(202);
        res.end();
        return;
      }

      if (method === "GET" && url === "/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        hub.add(res);
        hub.send(res, "snapshot", store.snapshots());
        return;
      }

      if (method === "GET") {
        await serveStatic(url, res);
        return;
      }

      res.writeHead(405);
      res.end();
    })();
  });
}

export interface RunningDashboard {
  server: Server;
  url: string;
  close(): Promise<void>;
}

/** Create and start a dashboard, resolving with its URL and a close(). */
export function startDashboard(options: DashboardOptions = {}): Promise<RunningDashboard> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8686;
  const server = createServer(options);
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({
        server,
        url: `http://${host}:${boundPort}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
