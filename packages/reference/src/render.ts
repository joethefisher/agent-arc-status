/**
 * Renderers turn arc.status events into human-facing strings for a given
 * surface (terminal, Slack, Telegram, etc.).
 *
 * Rendering is intentionally a consumer concern (see spec §1.3 design
 * principle 5: "Receiver renders"). These helpers are provided so common
 * cases work in one line; complex surfaces should write their own.
 */

import type { ArcStatusEvent, ArcStatusPhase } from "./types.js";

const PHASE_SYMBOLS: Record<ArcStatusPhase, string> = {
  started: "▶",
  milestone: "✓",
  heartbeat: "·",
  done: "■",
  blocked: "⛔",
};

const PHASE_LABELS: Record<ArcStatusPhase, string> = {
  started: "STARTED",
  milestone: "MILESTONE",
  heartbeat: "HEARTBEAT",
  done: "DONE",
  blocked: "BLOCKED",
};

export interface RenderOptions {
  /** Include a leading symbol per phase. Default: true. */
  symbol?: boolean;
  /** Include the phase label in CAPS. Default: false. */
  phaseLabel?: boolean;
  /** Include `step/total` if both are present on the event. Default: true. */
  step?: boolean;
  /** Include `eta_minutes` if present. Default: true. */
  eta?: boolean;
  /** Append the body, if present. Default: false. */
  body?: boolean;
  /** Truncate the body to N characters when included. Default: 240. */
  bodyMax?: number;
}

const DEFAULTS: Required<RenderOptions> = {
  symbol: true,
  phaseLabel: false,
  step: true,
  eta: true,
  body: false,
  bodyMax: 240,
};

/**
 * Render an event to a single human-readable line, with optional body block.
 *
 * Examples:
 *   "▶ build Pulsefeed v0.1"
 *   "✓ [6/11] receiver booted (ETA 25m)"
 *   "· still working: hyperparameter sweep (run 4/12)"
 *   "■ v0.1 complete, 43 tests, deployed"
 *   "⛔ need finance sign-off on plan-B reclassification"
 */
export function render(event: ArcStatusEvent, options?: RenderOptions): string {
  const opts = { ...DEFAULTS, ...options };

  const parts: string[] = [];

  if (opts.symbol) {
    parts.push(PHASE_SYMBOLS[event.phase]);
  }

  if (opts.phaseLabel) {
    parts.push(PHASE_LABELS[event.phase]);
  }

  if (
    opts.step &&
    typeof event.step === "number" &&
    typeof event.total === "number"
  ) {
    parts.push(`[${event.step}/${event.total}]`);
  }

  parts.push(event.title);

  if (opts.eta && typeof event.eta_minutes === "number") {
    parts.push(`(ETA ${formatMinutes(event.eta_minutes)})`);
  }

  let line = parts.join(" ");

  if (opts.body && event.body) {
    const max = Math.max(1, opts.bodyMax);
    const body =
      event.body.length > max
        ? event.body.slice(0, max - 1) + "…"
        : event.body;
    line += "\n" + body;
  }

  return line;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return "<1m";
  // Round to whole minutes first, then split into h/m, so a value like 119.6
  // becomes 2h rather than the malformed "1h60m".
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}
