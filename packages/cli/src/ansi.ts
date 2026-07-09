import type { ArcStatusPhase } from "@agent-arc-status/reference";

export interface ColorEnv {
  isTty: boolean;
  env: Record<string, string | undefined>;
  noColorFlag?: boolean;
}

/** Honor the NO_COLOR convention, `TERM=dumb`, `--no-color`, and non-TTY output. */
export function supportsColor(io: ColorEnv): boolean {
  if (io.noColorFlag) return false;
  if (io.env["NO_COLOR"] !== undefined) return false;
  if (io.env["TERM"] === "dumb") return false;
  return io.isTty;
}

const RESET = "[0m";

export function color(text: string, code: number, enabled: boolean): string {
  return enabled ? `[${code}m${text}${RESET}` : text;
}

/** ANSI SGR codes per phase (dim heartbeats, red blocked, green done, etc.). */
export const PHASE_COLOR: Record<ArcStatusPhase, number> = {
  started: 36, // cyan
  milestone: 32, // green
  heartbeat: 2, // dim
  done: 92, // bright green
  blocked: 31, // red
};
