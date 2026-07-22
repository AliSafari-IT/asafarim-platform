import { value, type FakeProviderScript } from "../providers/fake";

/**
 * Fallback scenario for the keyed default fake provider (see
 * providers/defaultFake.ts) when a prompt doesn't match a known fixture
 * keyword. Deliberately conservative: recommends the blank template and
 * proposes no operations, so an unrecognized prompt still produces a
 * valid, safe, empty draft rather than guessing at a shape.
 */
export const GENERIC_FALLBACK_SCRIPT: FakeProviderScript = {
  analyzeRequirements: [
    value({
      appPurpose: "A general-purpose internal business application.",
      targetUsers: [],
      entities: [],
      relationships: [],
      roles: [],
      pages: [],
      dashboards: [],
      workflows: [],
      fileNeeds: [],
      assumptions: ["No specific entities or workflows were identified from the request; starting from a blank draft."],
      exclusions: [],
      clarificationQuestions: [],
      confidence: "medium",
    }),
  ],
  recommendTemplate: [
    value({
      templateId: "blank",
      reasoningSummary: "No specific application family was identified; starting blank preserves the requested starter as the safest default.",
      confidence: "medium",
    }),
  ],
  proposeOperations: [value({ reasoningSummary: "No additional structure could be safely inferred.", isFinalBatch: true, operations: [] })],
};
