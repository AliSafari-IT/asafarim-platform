import type { ModificationDecisionType } from "../schemas/modificationDecision";
import type { ModificationClarificationQuestionType, ModificationClarificationChoiceType } from "../schemas/modificationClarification";
import type { ProposedOperationType } from "../schemas/operationProposal";
import type { ProposeModificationInput } from "../provider/types";
import type { ContextTargetCandidate, GroundedModificationContext } from "../provider/groundedContext";
import { describeCapabilityGaps } from "../capabilities/catalog";

/**
 * M13 slice D/E — the grounded replacement for the modification fixture's
 * "too broad" reflex.
 *
 * Root cause #7 in the M13 analysis is that the default fake provider
 * *scripted* the exact refusal the reported conversation received, so local
 * dev, CI, and Playwright all rehearsed the bug. This module removes that
 * for every request the server could actually ground: given the resolved
 * target candidates the assembler produced, it derives the operation a
 * competent model would propose, deterministically and without a network
 * call.
 *
 * It is still a fixture, and it stays deliberately literal about that:
 * it does not attempt intent understanding, only the mechanical step from
 * "the server resolved target X and the request names value/colour Y" to
 * "the operation that writes Y into X". Anything it can't derive returns
 * `null`, and the caller falls back to the generic script — a fixture that
 * guessed would be a fixture that hides regressions.
 *
 * Everything it emits still goes through the real pipeline unchanged:
 * schema validation, dry run, capability checks, destructive confirmation,
 * versioning, and validation gates. A fixture cannot apply anything.
 *
 * M13 slice E: ambiguous/unresolved resolution now returns a real
 * `needs_clarification` decision with grounded, targetId-addressed choices
 * (built from the resolver's own candidate list) instead of the slice-D
 * failure message, and a request naming a known-unsupported surface
 * (Framer Motion, GitHub) is honestly labelled `partially_supported`/
 * `unsupported` alongside whatever WAS resolvable.
 */

/** Named colours mapped into the palette-ish hex the branding schema requires (`#rrggbb`). Reversible presentation defaults, per the M13 product contract — exact hex is optional, never demanded. */
const COLOR_HEX: Record<string, string> = {
  black: "#111111",
  white: "#ffffff",
  red: "#dc2626",
  orange: "#ea580c",
  yellow: "#ca8a04",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#7c3aed",
  violet: "#7c3aed",
  pink: "#db2777",
  grey: "#6b7280",
  gray: "#6b7280",
  brown: "#78350f",
  teal: "#0d9488",
  cyan: "#0891b2",
  magenta: "#c026d3",
  indigo: "#4f46e5",
  navy: "#1e3a8a",
  gold: "#b45309",
  silver: "#9ca3af",
};

const REPLACEMENT_PATTERN = /\b(?:replace|change|rename|update|set|make)\b[^]*?\bto\b\s+([^,.;]{1,120})/i;

/**
 * Builds the decision the grounded context implies, or `null` when it
 * implies nothing specific enough to act on (the caller falls back to the
 * generic clarification script).
 */
export function groundedModificationDecision(input: ProposeModificationInput): ModificationDecisionType | null {
  const grounded = input.groundedContext;
  if (!grounded) return null;

  if (grounded.resolutionOutcome === "ambiguous" || grounded.resolutionOutcome === "unresolved") {
    if (!grounded.groundedQuestion) return null;
    return { outcome: "needs_clarification", question: buildQuestionFromCandidates(grounded) };
  }

  const resolved = grounded.resolvedTarget;
  if (!resolved) return null;

  const gaps = describeCapabilityGaps(input.userRequest);

  const color = findColor(input.userRequest);
  if (color) {
    const colorDecision = proposeColorChange(grounded, resolved, color, gaps);
    if (colorDecision) return colorDecision;
  }

  const replacement = findReplacementValue(input.userRequest);
  if (replacement) {
    const operation = writeValueOperation(resolved, replacement);
    if (operation) {
      const summary =
        `Updating ${resolved.label} to "${replacement}". ` +
        `I matched that to ${describeMatch(resolved)} — tell me if you meant something else and I'll move it.`;
      const plan = [
        {
          title: `Update ${resolved.label}`,
          batch: {
            reasoningSummary: `Writes "${replacement}" into the deterministically resolved target ${resolved.targetId}.`,
            isFinalBatch: true,
            operations: [operation],
          },
        },
      ];
      return gaps.length > 0
        ? { outcome: "partially_supported", summary, assumptions: [], plan, unsupported: gaps }
        : { outcome: "ready", summary, assumptions: [], plan };
    }
  }

  if (gaps.length > 0) return { outcome: "unsupported", unsupported: gaps, alternatives: [] };
  return null;
}

/**
 * A colour request against a schema with no per-element colour field. The
 * only colour-valued property `@asafarim/appbuilder-schema` can express is
 * `branding.primaryColor` (see packages/appbuilder-schema/src/branding.ts —
 * `Branding` is a fixed typed set, never a CSS escape hatch), which the
 * resolver already supplies as a capability candidate. Proposing it while
 * saying plainly that it is app-wide is the honest answer; refusing because
 * "no title colour exists" is the reported bug.
 */
function proposeColorChange(
  grounded: GroundedModificationContext,
  resolved: ContextTargetCandidate,
  color: string,
  gaps: ReturnType<typeof describeCapabilityGaps>,
): ModificationDecisionType | null {
  const hex = color.startsWith("#") ? color : COLOR_HEX[color];
  if (!hex) return null;

  const colorTarget =
    resolved.property === "primaryColor"
      ? resolved
      : grounded.targetCandidates.find((candidate) => candidate.property === "primaryColor");
  if (!colorTarget) return null;

  const aboutSomethingElse = colorTarget.targetId !== resolved.targetId;
  const summary = aboutSomethingElse
    ? `I matched "${color}" to ${describeMatch(resolved)}, but this app's specification has no per-element colour — the closest thing I can actually change is the app's primary brand colour, so I'm setting that to ${hex}. That applies app-wide, not just to ${resolved.label}.`
    : `Setting the app's primary brand colour to ${hex} for "${color}".`;

  const plan = [
    {
      title: "Update brand colour",
      batch: {
        reasoningSummary: `Maps the colour "${color}" onto branding.primaryColor (${hex}), the only colour-valued property in this schema.`,
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: false,
            operation: { opVersion: "1.0.0" as const, type: "UPDATE_BRANDING" as const, patch: { primaryColor: hex } },
          },
        ],
      },
    },
  ];

  return gaps.length > 0
    ? { outcome: "partially_supported", summary, assumptions: [], plan, unsupported: gaps }
    : { outcome: "ready", summary, assumptions: [], plan };
}

/** Maps a resolved target's property onto the allowlisted operation that writes it. Returns `null` for properties no single bounded operation can set. */
function writeValueOperation(target: ContextTargetCandidate, newValue: string): ProposedOperationType | null {
  if (target.kind === "page" && target.property === "name" && target.pageId) {
    return {
      modelBelievesDestructive: false,
      operation: { opVersion: "1.0.0", type: "UPDATE_PAGE", pageId: target.pageId, patch: { name: newValue } },
    };
  }
  if (target.kind === "entity" && target.property === "name" && target.entityId) {
    return {
      modelBelievesDestructive: false,
      operation: { opVersion: "1.0.0", type: "UPDATE_ENTITY", entityId: target.entityId, patch: { name: newValue } },
    };
  }
  if (target.kind === "field" && target.property === "name" && target.entityId && target.fieldId) {
    return {
      modelBelievesDestructive: false,
      operation: {
        opVersion: "1.0.0",
        type: "UPDATE_FIELD",
        entityId: target.entityId,
        fieldId: target.fieldId,
        patch: { name: newValue },
      },
    };
  }
  if (target.kind === "component" && target.property.startsWith("config.") && target.pageId && target.componentId) {
    const key = target.property.slice("config.".length);
    return {
      modelBelievesDestructive: false,
      operation: {
        opVersion: "1.0.0",
        type: "UPDATE_COMPONENT",
        pageId: target.pageId,
        componentId: target.componentId,
        patch: { config: { [key]: newValue } },
      },
    };
  }
  // Navigation labels are set through UPDATE_NAVIGATION, which replaces the
  // WHOLE array — a fixture that reconstructed it from a single candidate
  // would risk dropping the other entries, so this deliberately declines
  // rather than guessing.
  return null;
}

/** Builds a schema-valid (2-5 choice) clarification question from the resolver's own ranked candidates — never a generic "could you be more specific?". */
function buildQuestionFromCandidates(grounded: GroundedModificationContext): ModificationClarificationQuestionType {
  const choices: ModificationClarificationChoiceType[] = grounded.targetCandidates
    .slice(0, 5)
    .map((candidate, index) => ({ id: `candidate_${index}`, label: candidate.label, targetId: candidate.targetId }));

  while (choices.length < 2) {
    choices.push({
      id: choices.length === 0 ? "none_matched" : "something_else",
      label: choices.length === 0 ? "None of these — let me describe it" : "Something else",
    });
  }

  return {
    id: "q_target_resolution",
    text: grounded.groundedQuestion ?? "Which one did you mean?",
    choices,
    allowFreeText: true,
  };
}

function describeMatch(target: ContextTargetCandidate): string {
  const evidence = target.evidence[0];
  return evidence ? `${target.label} (${evidence})` : target.label;
}

function findColor(request: string): string | null {
  const hex = request.match(/#[0-9a-fA-F]{6}\b/);
  if (hex) return hex[0].toLowerCase();
  const lowered = request.toLowerCase();
  for (const name of Object.keys(COLOR_HEX)) {
    if (new RegExp(`(?:^|[^a-z])${name}(?:$|[^a-z])`).test(lowered)) return name;
  }
  return null;
}

function findReplacementValue(request: string): string | null {
  const match = request.match(REPLACEMENT_PATTERN);
  if (!match) return null;
  const value = match[1].trim().replace(/^["'`]|["'`.?!]$/g, "").trim();
  if (!value || COLOR_HEX[value.toLowerCase()]) return null;
  return value;
}
