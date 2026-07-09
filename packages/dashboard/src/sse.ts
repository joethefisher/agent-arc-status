import type { ServerResponse } from "node:http";

/** A minimal Server-Sent-Events hub: named events broadcast to all clients. */
export class SseHub {
  readonly #clients = new Set<ServerResponse>();

  add(res: ServerResponse): void {
    this.#clients.add(res);
    res.on("close", () => this.#clients.delete(res));
  }

  send(res: ServerResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.#clients) res.write(payload);
  }

  get size(): number {
    return this.#clients.size;
  }
}
