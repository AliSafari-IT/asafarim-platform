import { DESTINATIONS, type Destination } from "@asafarim/tool-handoff";
import { TOOL_LIFECYCLES, TOOL_SLUGS, type ToolLifecycle, type ToolSlug } from "./types";

/**
 * The only way AI Workbench code talks to analytics (#682). Event dictionary:
 * docs/ai-tools/analytics.md (version below). Every event has a closed set of
 * low-cardinality properties; a runtime sanitizer drops anything else, so
 * input, output, excerpts, prompts, emails, IPs, handoff ids, and provider
 * errors can't be sent even by mistake. Components must not call
 * `window.umami` directly (a test enforces it).
 */
export const ANALYTICS_DICTIONARY_VERSION = "ai-tools-events/1";

export const RUN_FAILURE_CATEGORIES = ["invalid", "rate_limited", "quota", "unavailable", "paused", "failed"] as const;
export const EDIT_ACTIONS = ["edit", "remove", "reorder", "select", "dependency", "status", "conflict", "undo"] as const;
export const EXPORT_FORMATS = ["markdown", "json"] as const;
export const RUN_INPUTS = ["example", "own"] as const;

type Base = { tool: ToolSlug; tool_version: string };

export type ToolEvent =
  | { name: "ai_tool_view"; props: Base & { lifecycle: ToolLifecycle } }
  | { name: "ai_tool_example_loaded"; props: Base }
  | { name: "ai_tool_run_started"; props: Base & { input: (typeof RUN_INPUTS)[number] } }
  | { name: "ai_tool_run_succeeded"; props: Base & { mode: "fixture" | "live" } }
  | { name: "ai_tool_run_degraded"; props: Base & { mode: "fixture" | "live" } }
  | { name: "ai_tool_run_failed"; props: Base & { category: (typeof RUN_FAILURE_CATEGORIES)[number] } }
  | { name: "ai_tool_result_edited"; props: Base & { action: (typeof EDIT_ACTIONS)[number] } }
  | { name: "ai_tool_exported"; props: Base & { format: (typeof EXPORT_FORMATS)[number] } }
  | { name: "ai_tool_handoff_started"; props: Base & { destination: Destination } }
  | { name: "ai_tool_case_study_opened"; props: Base }
  | { name: "ai_tool_contact_opened"; props: Base };

// `ai_tool_handoff_completed` is sent by the destination apps through
// `handoffCompletedEvent` in @asafarim/tool-handoff, with the same rules.

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ALLOWED: Record<string, (value: unknown) => boolean> = {
  tool: (v) => (TOOL_SLUGS as readonly unknown[]).includes(v),
  tool_version: (v) => typeof v === "string" && VERSION.test(v),
  lifecycle: (v) => (TOOL_LIFECYCLES as readonly unknown[]).includes(v),
  input: (v) => (RUN_INPUTS as readonly unknown[]).includes(v),
  mode: (v) => v === "fixture" || v === "live",
  category: (v) => (RUN_FAILURE_CATEGORIES as readonly unknown[]).includes(v),
  action: (v) => (EDIT_ACTIONS as readonly unknown[]).includes(v),
  format: (v) => (EXPORT_FORMATS as readonly unknown[]).includes(v),
  destination: (v) => (DESTINATIONS as readonly unknown[]).includes(v),
};
const EVENTS = new Set<ToolEvent["name"]>([
  "ai_tool_view",
  "ai_tool_example_loaded",
  "ai_tool_run_started",
  "ai_tool_run_succeeded",
  "ai_tool_run_degraded",
  "ai_tool_run_failed",
  "ai_tool_result_edited",
  "ai_tool_exported",
  "ai_tool_handoff_started",
  "ai_tool_case_study_opened",
  "ai_tool_contact_opened",
]);

/** Keeps only allowlisted keys with allowlisted values; null if the event isn't in the dictionary. */
export function sanitizeEvent(name: string, props: Record<string, unknown>): { name: string; props: Record<string, string> } | null {
  if (!EVENTS.has(name as ToolEvent["name"])) return null;
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (ALLOWED[key]?.(value)) clean[key] = String(value);
  }
  return clean.tool && clean.tool_version ? { name, props: clean } : null;
}

type Umami = { track: (name: string, data: Record<string, string>) => void };

/**
 * Sends an event if analytics is available. Skips automated browsers (E2E,
 * most bots) so tests and crawlers don't count as visitors. Never throws.
 */
export function trackToolEvent(event: ToolEvent, env: { umami?: Umami; webdriver?: boolean } = browserEnv()): void {
  try {
    if (env.webdriver || !env.umami) return;
    const clean = sanitizeEvent(event.name, event.props);
    if (clean) env.umami.track(clean.name, clean.props);
  } catch {
    // Analytics must never break the tool.
  }
}

function browserEnv(): { umami?: Umami; webdriver?: boolean } {
  if (typeof window === "undefined") return {};
  return { umami: (window as unknown as { umami?: Umami }).umami, webdriver: navigator.webdriver === true };
}

/** Maps a finished run to its analytics event (no free-form text crosses). */
export function runOutcomeEvent(
  base: Base,
  outcome: { kind: string; mode?: "fixture" | "live"; reason?: string; scope?: string }
): ToolEvent | null {
  switch (outcome.kind) {
    case "success":
      return { name: "ai_tool_run_succeeded", props: { ...base, mode: outcome.mode ?? "fixture" } };
    case "degraded":
      return { name: "ai_tool_run_degraded", props: { ...base, mode: outcome.mode ?? "fixture" } };
    case "invalid":
      return { name: "ai_tool_run_failed", props: { ...base, category: "invalid" } };
    case "rate-limited":
      return { name: "ai_tool_run_failed", props: { ...base, category: outcome.scope === "daily" ? "quota" : "rate_limited" } };
    case "provider-disabled":
      return { name: "ai_tool_run_failed", props: { ...base, category: outcome.reason === "paused" ? "paused" : "unavailable" } };
    case "failed":
      return { name: "ai_tool_run_failed", props: { ...base, category: "failed" } };
    default:
      return null;
  }
}
