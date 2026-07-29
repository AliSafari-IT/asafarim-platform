import { value, type FakeProviderScript, type ProposedOperationType } from "@asafarim/appbuilder-ai";

/** The parts of `SelectionContextType` (apps/appbuilder/lib/modification/selectionContext.ts) a case can specify — `appId`/`specificationVersionNumber` are filled in by runEvaluation.ts from the freshly-created eval app, since they can't be known ahead of time. */
export interface PartialSelection {
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  label?: string;
}

/**
 * M13 Slice A regression corpus — one case per row of
 * docs/appbuilder-m13-multimodal-contextual-assistant.md's "Acceptance
 * scenarios" table, itself distilled from the reported post-M12
 * conversation. Each case pairs an honest `expected` label (what the M13
 * product contract requires) with `reproducedProviderScript` — the actual
 * scripted response a real provider gave for that request today, taken
 * verbatim from the bug report. Running this corpus through the real
 * `runModificationJob` pipeline (unmodified) reproduces the reported
 * failures deterministically, without a network call.
 *
 * All cases share one fixture app (see runEvaluation.ts's `setupTitleApp`):
 * a `home` page named "Home", a matching navigation item, and
 * `branding.primaryColor` set to a non-blue default — the only
 * schema-representable stand-ins for "the title" and "the title color" the
 * current @asafarim/appbuilder-schema allowlist can express (there is no
 * heading/rich-text component kind — see COMPONENT_KINDS in
 * packages/appbuilder-schema/src/constants.ts).
 */

export type CapabilityClass = "supported" | "partially_supported" | "unsupported" | "needs_clarification";

export interface ExpectedLabels {
  /** What the user is actually asking for, in plain language. */
  intent: string;
  /** The spec location (or lack thereof) that request should resolve to. */
  targetDescription: string;
  capabilityClass: CapabilityClass;
  /** Whether a clarifying question is genuinely warranted under the M13 product contract (docs section "Product contract"). */
  questionNeeded: boolean;
  /** Set only for the one case that requires a staged multi-batch plan (M13 "Large requests"). */
  requiresPlan?: boolean;
  /** Set for cases where an honest partial-support/unsupported disclosure is owed instead of silence or a vague rejection. */
  requiresCapabilityDisclosure?: boolean;
  /** Forward-compat target check for once slice D/E land a real fix — absent where no single resolvable target exists yet. */
  matchesTarget?: (operations: readonly ProposedOperationType[]) => boolean;
}

export interface RegressionCase {
  id: string;
  /** The root-cause / reported-conversation moment this case reproduces. */
  description: string;
  userRequestText: string;
  selection: PartialSelection | null;
  expected: ExpectedLabels;
  reproducedProviderScript: FakeProviderScript;
}

/**
 * The exact response reported for every case in the M13 doc's baseline
 * conversation, translated onto the CURRENT provider-boundary schema
 * (ModificationDecision, M13 slice E) so the frozen scenario stays
 * replayable — what's frozen is the SCENARIO the pre-M13 system produced
 * (a generic, non-grounded refusal), never the wire shape of a schema that
 * didn't exist yet. `needs_clarification` with a generic, ungrounded
 * question is the accurate slice-E-shaped equivalent of the old
 * `clarificationNeeded: true` refusal.
 */
function tooBroadScript(summary: string): FakeProviderScript {
  return {
    proposeModification: [
      value({
        outcome: "needs_clarification",
        question: {
          id: "q_too_broad",
          text: summary,
          choices: [
            { id: "field", label: "A field on an entity" },
            { id: "page_or_permission", label: "A page or a permission" },
          ],
          allowFreeText: true,
        },
      }),
    ],
  };
}

export const REGRESSION_CORPUS: RegressionCase[] = [
  {
    id: "landing_page_brief",
    description:
      "Root cause #4/#5: a detailed AI-engineer landing-page brief (structure, content, branding, integration, animation) rejected outright as too broad instead of staged.",
    userRequestText:
      "Build a full landing page for an AI engineer: hero section with headline and CTA, an about section, a projects showcase pulling from GitHub, a contact form, our brand colors, and smooth Framer Motion animations throughout.",
    selection: null,
    expected: {
      intent: "build out a full landing page across structure, content, branding, integration, and animation",
      targetDescription: "whole app — multiple pages/components/branding, staged across capability-aware batches",
      capabilityClass: "partially_supported",
      questionNeeded: false,
      requiresPlan: true,
      requiresCapabilityDisclosure: true,
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
  {
    id: "rename_home_title",
    description: 'Root cause #6: "replace the title Home to Experiences" rejected despite a unique, exact-match target.',
    userRequestText: "replace the title Home to Experiences",
    selection: null,
    expected: {
      intent: "rename the Home page's title to Experiences",
      targetDescription: 'pages[id="home"].name (the only page/navigation label with value "Home")',
      capabilityClass: "supported",
      questionNeeded: false,
      matchesTarget: (ops) =>
        ops.some(
          (o) => o.operation.type === "UPDATE_PAGE" && o.operation.pageId === "home" && o.operation.patch.name === "Experiences",
        ),
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
  {
    id: "title_color_blue",
    description: 'Root cause #5: "change the title color to blue" rejected — no per-title color field exists, but branding.primaryColor is a representable adjacent capability.',
    userRequestText: "change the title color to blue",
    selection: null,
    expected: {
      intent: "recolor the Home title text to blue",
      targetDescription: "branding.primaryColor — the closest representable capability; no per-title color field exists in the current schema",
      capabilityClass: "partially_supported",
      questionNeeded: false,
      requiresCapabilityDisclosure: true,
      matchesTarget: (ops) => ops.some((o) => o.operation.type === "UPDATE_BRANDING" && Boolean(o.operation.patch.primaryColor)),
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
  {
    id: "title_value_home",
    description: '"the title whose value is Home" — exact-value target search that should retain the prior turn\'s requested color action (needs conversation memory, which does not exist yet).',
    userRequestText: "the title whose value is Home, make it blue",
    selection: null,
    expected: {
      intent: "resolve the target by its exact current value ('Home'), then apply the still-pending blue-color request",
      targetDescription: 'pages[id="home"].name (matched by exact value "Home") -> branding.primaryColor',
      capabilityClass: "partially_supported",
      questionNeeded: false,
      requiresCapabilityDisclosure: true,
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
  {
    id: "selector_still_black",
    description:
      'Root cause #6: a DOM selector plus "still black" — the assistant kept asking for details instead of recognizing the selector points at builder chrome, not an editable component.',
    userRequestText: "still black",
    selection: { pageId: "home", label: "Home" },
    expected: {
      intent: "keep the color blue from two turns ago; correct the assistant's mistaken 'still black' assumption",
      targetDescription: "the selector resolves to page-title chrome text, not a schema component — no direct mutation target exists",
      capabilityClass: "unsupported",
      questionNeeded: false,
      requiresCapabilityDisclosure: true,
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
  {
    id: "resume_page_level",
    description:
      'Root cause #3: "at the page level" sent as the answer to a just-asked scope question, but the pipeline has no clarification-resume state, so it is evaluated as a brand-new, context-free request.',
    userRequestText: "at the page level",
    selection: null,
    expected: {
      intent: "answer the assistant's own pending scope question for the previous request — not a new request",
      targetDescription: "resumes the pending clarification for the most recent modification intent; no target derivable in isolation",
      capabilityClass: "needs_clarification",
      questionNeeded: false,
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
  {
    id: "screenshot_make_blue",
    description:
      "Root cause #1: a screenshot plus \"make this blue\" — there is no evidence channel yet, so the image is silently dropped and the text alone is treated as ambiguous.",
    userRequestText: "make this blue",
    selection: null,
    expected: {
      intent: "use the attached screenshot to resolve the target, then recolor it blue",
      targetDescription: "would be resolved from the attached screenshot; attachments are not implemented, so no image evidence reaches the provider",
      capabilityClass: "unsupported",
      questionNeeded: false,
      requiresCapabilityDisclosure: true,
    },
    reproducedProviderScript: tooBroadScript(
      "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
    ),
  },
];
