/**
 * Agent Arc Status Protocol — reference implementation (v0.2).
 *
 * Spec: https://github.com/joethefisher/agent-arc-status
 *
 * This package provides:
 *   - TypeScript types matching the wire schema
 *   - Structural validator (single event)
 *   - Sequence validator (phase-ordering rules per arc)
 *   - JSON / JSON Lines parsers
 *   - A default human-line renderer
 *
 * It is intentionally tiny and has zero runtime dependencies. If you need
 * canonical-schema validation against `spec/schema.json`, use any standard
 * JSON Schema validator (ajv, etc.) — the schema is the source of truth and
 * this validator mirrors it.
 */

export {
  ARC_STATUS_PHASES,
  type ArcStatusEvent,
  type ArcStatusPhase,
} from "./types.js";

export {
  validate,
  validateSequence,
  RFC3339_PATTERN,
  type ValidationResult,
  type ValidationIssue,
  type SequenceIssue,
  type SequenceOptions,
} from "./validate.js";

export {
  parse,
  parseJsonl,
  type JsonlParseResult,
} from "./parse.js";

export {
  render,
  type RenderOptions,
} from "./render.js";

export {
  CadenceController,
  SilenceWatchdog,
  type CadenceConfig,
  type ArcSeed,
  type StalledArc,
} from "./cadence.js";

export {
  reduceArc,
  type ArcState,
  type ArcMilestone,
} from "./state.js";

/** The Protocol version this package implements. */
export const PROTOCOL_VERSION = "0.2.0";
