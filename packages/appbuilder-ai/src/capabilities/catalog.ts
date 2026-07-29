import { COMPONENT_KINDS, FIELD_TYPES, Operation } from "@asafarim/appbuilder-schema";
import type { ModificationCapabilityGapType } from "../schemas/modificationDecision";

/**
 * M13 slice E — the capability catalogue the "partially_supported" and
 * "unsupported" decision outcomes are judged against (docs/appbuilder-m13-
 * multimodal-contextual-assistant.md, "Intent and capability contract":
 * "Generate the capability catalogue from the actual operation union,
 * branding schema, component/integration registries, and active flags").
 *
 * Derived from `@asafarim/appbuilder-schema`'s own allowlists — never a
 * second, hand-maintained list that can drift from what the operation
 * engine actually accepts. `Operation.options` reads the discriminated
 * union's own branches, so a schema-version bump that adds/removes an
 * operation kind changes this catalogue automatically, with no edit here.
 */

export type CapabilityStatus =
  | "supported_now"
  | "supported_as_plan"
  | "partially_supported"
  | "unsupported_schema"
  | "unsupported_component"
  | "unsupported_integration"
  | "unsupported_flag"
  | "temporarily_unavailable";

export interface CapabilityCatalogEntry {
  id: string;
  description: string;
  status: CapabilityStatus;
}

function operationKinds(): string[] {
  return Operation.options.map((branch) => branch.shape.type.value as string);
}

/**
 * Product surfaces explicitly named out of scope for M13 (docs, "Out of
 * scope"): arbitrary source-code/CSS/animation editing, script execution,
 * and third-party integrations that need a separately authorized channel.
 * `github_reference_import` stays `unsupported_flag` until slice F ships
 * and turns its feature flag on — never silently upgraded here.
 */
const KNOWN_UNSUPPORTED: CapabilityCatalogEntry[] = [
  {
    id: "arbitrary_css_or_animation",
    description: "Arbitrary CSS, custom animation libraries (e.g. Framer Motion), or free-form visual styling beyond the branding schema.",
    status: "unsupported_schema",
  },
  {
    id: "arbitrary_source_code",
    description: "Editing, generating, or executing arbitrary source code, scripts, macros, or binaries inside a generated app.",
    status: "unsupported_schema",
  },
  {
    id: "github_reference_import",
    description: "Importing public GitHub repository/profile metadata as grounding content.",
    status: "unsupported_flag",
  },
  {
    id: "public_url_import",
    description: "Importing content from an arbitrary public URL.",
    status: "unsupported_flag",
  },
  {
    id: "audio_video_understanding",
    description: "Understanding or generating audio/video content.",
    status: "unsupported_schema",
  },
];

/** Builds the current capability catalogue — pure, deterministic, safe to compute per request (no I/O). */
export function buildCapabilityCatalog(): CapabilityCatalogEntry[] {
  const entries: CapabilityCatalogEntry[] = [];

  for (const kind of operationKinds()) {
    entries.push({ id: `operation.${kind}`, description: `Specification change via the ${kind} operation.`, status: "supported_now" });
  }
  for (const kind of COMPONENT_KINDS) {
    entries.push({ id: `component.${kind}`, description: `A page component of kind "${kind}".`, status: "supported_now" });
  }
  for (const type of FIELD_TYPES) {
    entries.push({ id: `field_type.${type}`, description: `An entity field of type "${type}".`, status: "supported_now" });
  }
  entries.push({
    id: "branding.primaryColor",
    description: "The app-wide primary brand colour — the only colour-valued property in the schema (no per-component colour field).",
    status: "supported_now",
  });
  entries.push({
    id: "multi_step_plan",
    description: "A request spanning several independently-applied changes (e.g. a landing-page brief), executed as a sequence of bounded, individually confirmed steps.",
    status: "supported_as_plan",
  });

  entries.push(...KNOWN_UNSUPPORTED);
  return entries;
}

const ANIMATION_PATTERN = /\bframer\s*motion\b|\banimat(?:e|ion|ions)\b|\btransition(?:s)?\b(?=.*\b(?:smooth|css|animate)\b)/i;
const GITHUB_PATTERN = /\bgithub\b/i;
const CODE_EXECUTION_PATTERN =
  /\brun(?:s|ning)?\b[\s\S]{0,40}?\b(?:script|macro|shell|binary)\b|\bexecut(?:e|es|ing)\b[\s\S]{0,40}?\b(?:code|script)\b/i;

/**
 * Deterministic, keyword-driven capability-gap detection used by the fake/
 * grounded fixture provider (packages/appbuilder-ai/src/fixtures) so CI can
 * exercise "partially_supported"/"unsupported" honestly without a network
 * call. A real provider is expected to reason over the catalogue supplied
 * in its prompt (see prompts/buildModificationPrompt.ts) rather than this
 * heuristic — this function exists for reproducible fixtures/tests only.
 */
export function describeCapabilityGaps(request: string): ModificationCapabilityGapType[] {
  const gaps: ModificationCapabilityGapType[] = [];
  if (ANIMATION_PATTERN.test(request)) {
    gaps.push({
      requested: "custom/Framer Motion animation",
      reason: "The specification schema has no animation or transition property — only fixed rendering primitives.",
      classification: "schema",
    });
  }
  if (GITHUB_PATTERN.test(request)) {
    gaps.push({
      requested: "pulling live content from GitHub",
      reason: "Public GitHub reference import is not yet enabled on this platform.",
      classification: "flag",
    });
  }
  if (CODE_EXECUTION_PATTERN.test(request)) {
    gaps.push({
      requested: "running a script or executing code",
      reason: "Generated apps never execute AI-written source code or arbitrary scripts.",
      classification: "schema",
    });
  }
  return gaps;
}
