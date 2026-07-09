/**
 * @agent-arc-status/emitter — a batteries-included producer for the Agent Arc
 * Status Protocol. Wraps the reference cadence controller, owns the backstop
 * timer, and guarantees started-first / terminal-on-exit emission.
 */

export {
  ArcEmitter,
  type ArcEmitterConfig,
  type EmitOptions,
  type TimerLike,
} from "./ArcEmitter.js";

export { type Transport } from "./transport.js";
export { httpTransport, type HttpTransportOptions } from "./transports/http.js";
export { stdoutTransport, type StdoutTransportOptions } from "./transports/stdout.js";
