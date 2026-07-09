#!/usr/bin/env node
import { startDashboard } from "../server.js";

const port = process.env["PORT"] !== undefined ? Number(process.env["PORT"]) : 8686;
const host = process.env["HOST"] ?? "127.0.0.1";
const hmacSecret = process.env["ARC_STATUS_SECRET"];

const dashboard = await startDashboard(
  hmacSecret !== undefined ? { port, host, hmacSecret } : { port, host },
);

process.stderr.write(`arc-dashboard on ${dashboard.url}  (POST arc.status events to ${dashboard.url}/ingest)\n`);

const stop = (): void => {
  void dashboard.close().then(() => process.exit(0));
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
