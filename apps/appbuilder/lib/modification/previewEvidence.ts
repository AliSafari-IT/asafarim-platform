import { z } from "zod";
import type { IndexedTarget, SpecIndex } from "./specIndex";
import { normalizeText } from "./specIndex";

/**
 * M13 slice D — mapping what the user clicked in the preview onto stable,
 * editable specification targets.
 *
 * The reported conversation's worst moment is the one this fixes: the user
 * supplied a DOM selector, the assistant still asked for details, and the
 * node in question wasn't a schema-editable component at all. Two rules
 * follow from that, and both are enforced here rather than trusted:
 *
 * 1. **A selector is evidence, never authority.** Nothing in this module
 *    returns an operation, a mutation, or anything an operation could be
 *    built from except stable ids that were found *in the current index*.
 *    A selector naming a component that doesn't exist maps to nothing.
 * 2. **Builder chrome is a real answer.** When the clicked node is part of
 *    the workspace shell (or preview furniture) rather than rendered
 *    specification content, saying so is the correct outcome. Slice E turns
 *    that into a user-facing capability notice; slice D classifies it so the
 *    interpretation step stops treating it as a target it merely failed to
 *    find.
 *
 * The DOM fields below are the ONLY DOM-derived data accepted, and each is
 * tightly bounded. No selectors are forwarded to a provider — only the
 * mapping result is.
 */

const MAX_DOM_TEXT_CHARS = 200;

/**
 * The bounded DOM evidence a preview click may carry, on top of the stable
 * ids the selection protocol already sends. Everything is optional: a click
 * on a properly instrumented component needs none of it.
 */
export const PreviewEvidence = z.object({
  /** e.g. `h1`, `button`. Lowercased tag name only — never an outerHTML fragment. */
  domTagName: z.string().max(40).optional(),
  /** The element's ARIA role, when it has one. */
  domRole: z.string().max(40).optional(),
  /** A bounded snippet of the element's own visible text — used to match indexed values. */
  domTextSnippet: z.string().max(MAX_DOM_TEXT_CHARS).optional(),
  /** True when the bridge found the node outside any `[data-ab-page-id]` region — i.e. workspace/preview furniture. */
  domOutsideSpecRegion: z.boolean().optional(),
});
export type PreviewEvidenceType = z.infer<typeof PreviewEvidence>;

export interface PreviewEvidenceInput extends PreviewEvidenceType {
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  label?: string;
}

export type PreviewEvidenceMapping =
  | {
      kind: "spec_target";
      /** Every editable property of the thing that was clicked, ranked-agnostic — the resolver decides which one the request is about. */
      targets: IndexedTarget[];
      matchedBy: "component_id" | "page_id" | "dom_text";
    }
  | {
      kind: "builder_chrome";
      /** Safe, user-facing explanation — no selector, no DOM. */
      reason: string;
    }
  | { kind: "unmapped"; reason: string };

/**
 * Tag names that are workspace/preview furniture rather than rendered
 * specification content. A click landing on one of these outside a
 * `data-ab-page-id` region is chrome, not a missing target.
 */
const CHROME_TAG_NAMES = new Set(["html", "body", "header", "nav", "aside", "footer", "iframe", "dialog"]);

/**
 * Maps one preview interaction onto the current specification. Pure — it
 * reads the index and nothing else, so every branch is directly testable.
 */
export function mapPreviewEvidence(
  evidence: PreviewEvidenceInput | null,
  index: SpecIndex,
): PreviewEvidenceMapping | null {
  if (!evidence) return null;

  if (evidence.componentId) {
    const targets = (index.byStableId.get(evidence.componentId) ?? []).filter(
      (target) => target.componentId === evidence.componentId,
    );
    if (targets.length > 0) return { kind: "spec_target", targets, matchedBy: "component_id" };
    return {
      kind: "unmapped",
      reason:
        "The selected element refers to a component that is no longer in this app's specification. Re-select it in the current preview.",
    };
  }

  if (evidence.pageId) {
    const targets = (index.byStableId.get(evidence.pageId) ?? []).filter((target) => target.pageId === evidence.pageId);
    if (targets.length > 0) return { kind: "spec_target", targets, matchedBy: "page_id" };
    return {
      kind: "unmapped",
      reason:
        "The selected element refers to a page that is no longer in this app's specification. Re-select it in the current preview.",
    };
  }

  // No stable id came with the click. Fall back to the one DOM signal that
  // can be checked against the specification rather than trusted: the
  // element's visible text matching a value the server itself indexed.
  const snippet = evidence.domTextSnippet ?? evidence.label;
  if (snippet) {
    const matches = index.byNormalizedValue.get(normalizeText(snippet)) ?? [];
    if (matches.length > 0) return { kind: "spec_target", targets: [...matches], matchedBy: "dom_text" };
  }

  if (evidence.domOutsideSpecRegion || (evidence.domTagName && CHROME_TAG_NAMES.has(evidence.domTagName.toLowerCase()))) {
    return {
      kind: "builder_chrome",
      reason:
        "That part of the preview is builder chrome — page framing drawn around your app rather than content the app specification describes — so there is nothing there for me to change.",
    };
  }

  return {
    kind: "unmapped",
    reason:
      "I couldn't match the element you selected to anything in this app's specification. Selecting a component in the preview, or naming the page or field, will pin it down.",
  };
}

/** The provider-safe projection: stable target ids only, never the originating DOM evidence. */
export function toContextPreviewEvidence(
  mapping: PreviewEvidenceMapping | null,
): { kind: PreviewEvidenceMapping["kind"]; reason?: string; targetIds?: string[] } | null {
  if (!mapping) return null;
  if (mapping.kind === "spec_target") {
    return { kind: mapping.kind, targetIds: mapping.targets.map((target) => target.targetId) };
  }
  return { kind: mapping.kind, reason: mapping.reason };
}
