/**
 * @agent-arc-status/adapter-mcp — bridge MCP progress notifications and
 * arc.status events in both directions. An MCP tool that runs for minutes is
 * silent from MCP's perspective until it returns; emitting arc.status events
 * from its progress notifications makes that work observable
 * (docs/comparison.md).
 *
 * Uses structural progress params (matching `@modelcontextprotocol/sdk`'s
 * `notifications/progress`) so the adapter carries no hard dependency; the SDK
 * is a peer.
 */

import type { ArcStatusEvent, EmitFn } from "@agent-arc-status/reference";

/** The params of an MCP `notifications/progress` message. */
export interface McpProgressParams {
  progressToken: string | number;
  progress: number;
  total?: number;
  message?: string;
}

export interface ArcContext {
  arcId: string;
  title?: string;
  arcKind?: string;
  /** Injectable clock (epoch ms) for deterministic timestamps. */
  now?: () => number;
}

function nowIso(now?: () => number): string {
  return new Date(now ? now() : Date.now()).toISOString();
}

function isPositiveInt(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 1;
}

/**
 * Map an MCP progress notification to an arc.status `milestone`. `progress`
 * becomes `step` and `total` becomes `total` when they are positive integers;
 * `message` becomes the title.
 */
export function mcpProgressToArc(params: McpProgressParams, ctx: ArcContext): ArcStatusEvent {
  const event: ArcStatusEvent = {
    arc_id: ctx.arcId,
    phase: "milestone",
    title: params.message ?? ctx.title ?? "progress",
    sent_at: nowIso(ctx.now),
  };
  if (isPositiveInt(params.progress)) event.step = params.progress;
  if (isPositiveInt(params.total)) event.total = params.total;
  if (ctx.arcKind !== undefined) event.arc_kind = ctx.arcKind;
  return event;
}

/**
 * Map an arc.status event to MCP progress params. `step` becomes `progress`,
 * `total` maps through, and the title becomes the progress `message`.
 */
export function arcToMcpProgress(
  event: ArcStatusEvent,
  progressToken: string | number,
): McpProgressParams {
  const params: McpProgressParams = {
    progressToken,
    progress: event.step ?? 0,
    message: event.title,
  };
  if (event.total !== undefined) params.total = event.total;
  return params;
}

/**
 * A sink that emits an arc.status event for each incoming MCP progress
 * notification — attach it where your MCP client/server receives progress.
 */
export function mcpProgressNotifier(
  emit: EmitFn,
  ctx: ArcContext,
): (params: McpProgressParams) => void | Promise<void> {
  return (params) => emit(mcpProgressToArc(params, ctx));
}
