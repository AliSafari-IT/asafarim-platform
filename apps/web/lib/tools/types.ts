import type { PlatformLinks } from "@asafarim/ui";

/**
 * Vocabulary for the AI Workbench tool catalogue (docs/ai-tools/charter.md).
 *
 * Catalogue entries are plain, JSON-serializable data. They must never hold
 * provider secrets, prompts, component references, or user content: the
 * registry is read by server pages, catalogue cards, metadata, and (later)
 * Showcase, so anything placed here is effectively public.
 */

/**
 * Every tool slug the Workbench knows about. Adding a slug here forces a
 * matching catalogue entry (validated) and a workbench in the closed map at
 * `app/tools/[slug]/workbenches.tsx` (type-checked), so a tool cannot exist
 * half-registered and the route never resolves a component from user input.
 */
export const TOOL_SLUGS = ["shell-reference", "requirements-to-test-plan", "notes-to-action-plan"] as const;
export type ToolSlug = (typeof TOOL_SLUGS)[number];

/** Charter §4. Separate from the platform app registry's `active | coming-soon`. */
export const TOOL_LIFECYCLES = ["experiment", "beta", "stable", "paused", "retired"] as const;
export type ToolLifecycle = (typeof TOOL_LIFECYCLES)[number];

/** Lifecycles whose public page is indexable (charter §4 table). */
export const INDEXABLE_LIFECYCLES: readonly ToolLifecycle[] = ["beta", "stable", "paused"];

export const TOOL_CATEGORIES = ["testing", "planning", "research", "reference"] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** Engineering capabilities a tool demonstrates; shown on cards and case studies. */
export const TOOL_CAPABILITIES = [
  "structured-output",
  "source-grounding",
  "uncertainty-labelling",
  "human-review",
  "export",
  "fixture-mode",
  "handoff",
] as const;
export type ToolCapability = (typeof TOOL_CAPABILITIES)[number];

/** Apps a tool can hand off to or link to — keys of `getPlatformLinks()`. */
export type RelatedAppKey = keyof PlatformLinks;

export interface ToolLimits {
  /** Hard cap on input length, enforced client-side and (from #673) server-side. */
  maxInputChars: number;
  /** Inputs shorter than this are rejected before any run. */
  minInputChars: number;
}

export interface ToolExample {
  /** Short button label, e.g. "Load the checkout example". */
  label: string;
  /** Synthetic example input. Never real or private data. */
  input: string;
  /**
   * Prepared result for exactly `input`. Shown labelled as an example, never
   * as a result generated from the visitor's text.
   */
  output: unknown;
}

export interface ToolDefinition {
  slug: ToolSlug;
  /** Names the user job, not "AI tool" (see #681). Used as the H1. */
  title: string;
  /** One sentence for cards and the meta description. */
  shortDescription: string;
  /** A paragraph for the tool page. */
  longDescription: string;
  category: ToolCategory;
  lifecycle: ToolLifecycle;
  /**
   * Must agree with `lifecycle` (validated): experiment/retired are never
   * indexable; beta/stable/paused always are. Kept explicit so a reviewer sees
   * the consequence of a lifecycle change in the diff.
   */
  indexable: boolean;
  /**
   * Internal tools (the shell reference) are never listed and are only routed
   * outside production. They must be `experiment` and not indexable.
   */
  internal?: boolean;
  /**
   * Whether the visitor's own text can produce a live AI result. `false`
   * means examples only. Must be `false` for paused, retired, and internal
   * tools (validated). Runtime kill switches (#680) can still disable a tool
   * whose entry says `true`.
   */
  liveGeneration: boolean;
  /** Position among featured tools on the catalogue; omit if not featured. */
  featuredOrder?: number;
  inputSummary: string;
  outputSummary: string;
  capabilities: ToolCapability[];
  example: ToolExample;
  limits: ToolLimits;
  /** What this tool actually gets wrong or does not do. At least one. */
  limitations: string[];
  /** Tool-specific retention/processing statement shown next to the input. */
  privacyStatement: string;
  /** The full app the result can continue in. */
  relatedApp?: { key: RelatedAppKey; name: string; reason: string };
  /** Path on the Showcase origin, e.g. "/projects/ai-workbench#test-plan". */
  caseStudyPath?: string;
  /** ISO date (YYYY-MM-DD) the page content was last materially reviewed. */
  lastReviewed: string;
}

/** What a visitor can do with a tool right now; shown on catalogue cards. */
export type ToolAvailability = "live" | "examples-only" | "paused";

export function toolAvailability(tool: Pick<ToolDefinition, "lifecycle" | "liveGeneration">): ToolAvailability {
  if (tool.lifecycle === "paused") return "paused";
  return tool.liveGeneration ? "live" : "examples-only";
}

/**
 * Where a result came from. `fixture` results are prepared samples; they must
 * never be presented as generated from the visitor's input.
 */
export type ToolRunMode = "fixture" | "live";

/**
 * What a runner reports back. `success`/`degraded` carry a result; every
 * other outcome deliberately cannot.
 */
export type ToolRunOutcome<TResult> =
  | { kind: "success"; mode: ToolRunMode; result: TResult }
  | { kind: "degraded"; mode: ToolRunMode; result: TResult; missing: string[] }
  | { kind: "invalid"; issues: string[] }
  | { kind: "rate-limited"; retryAfterSeconds?: number }
  | { kind: "provider-disabled"; reason: "paused" | "unavailable" }
  | { kind: "failed"; message?: string };

/** Client-side runner a tool workbench supplies. Must honour `signal`. */
export type ToolRunner<TResult> = (input: string, signal: AbortSignal) => Promise<ToolRunOutcome<TResult>>;
