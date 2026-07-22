import { value, type FakeProviderScript } from "../providers/fake";

/** Deterministic success fixture: a CRM request, mapped to the "crm" template plus one additive field. */
export const CRM_SUCCESS_SCRIPT: FakeProviderScript = {
  analyzeRequirements: [
    value({
      appPurpose: "Track sales contacts and the deals in progress with them.",
      targetUsers: ["Sales reps", "Sales manager"],
      entities: [
        { name: "Contact", purpose: "A person or company we sell to.", importantFields: [{ name: "name" }, { name: "email" }] },
        { name: "Deal", purpose: "An in-progress sale.", importantFields: [{ name: "title" }, { name: "stage" }, { name: "value" }] },
      ],
      relationships: [{ fromEntity: "Deal", toEntity: "Contact", cardinality: "oneToMany" }],
      roles: [{ name: "Sales rep", accessSummary: "Manages their own contacts and deals." }],
      pages: [{ name: "Deals", purpose: "Pipeline board.", primaryEntity: "Deal" }],
      dashboards: [{ name: "Pipeline overview" }],
      workflows: [],
      fileNeeds: [],
      assumptions: ["Single sales team, no territory management."],
      exclusions: ["Email/calendar integration."],
      clarificationQuestions: [],
      confidence: "high",
    }),
  ],
  recommendTemplate: [
    value({
      templateId: "crm",
      reasoningSummary: "Contacts plus a deal pipeline is exactly the crm starter's shape.",
      confidence: "high",
    }),
  ],
  proposeOperations: [
    value({
      reasoningSummary: "Adds a phone field to Contact for the sales team's outreach workflow.",
      isFinalBatch: true,
      operations: [
        {
          modelBelievesDestructive: false,
          operation: {
            opVersion: "1.0.0",
            type: "ADD_FIELD",
            entityId: "contact",
            field: {
              id: "phone",
              machineName: "phone",
              name: "Phone",
              required: false,
              unique: false,
              archived: false,
              type: "text",
            },
          },
        },
      ],
    }),
  ],
};
