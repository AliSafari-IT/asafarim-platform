import { value, type FakeProviderScript } from "../providers/fake";

/**
 * Vague prompt ("build me a task manager") that genuinely needs one round
 * of clarification before a template/operations can be safely proposed.
 * First `analyzeRequirements` call returns low confidence + questions;
 * after the pipeline persists them and an owner/editor answers, the
 * SECOND `analyzeRequirements` call (scripted next in the array) returns a
 * confident, answerable analysis and the job proceeds normally.
 */
export const CLARIFICATION_NEEDED_SCRIPT: FakeProviderScript = {
  analyzeRequirements: [
    value({
      appPurpose: "A task manager for a team.",
      targetUsers: [],
      entities: [{ name: "Task", importantFields: [{ name: "title" }] }],
      relationships: [],
      roles: [],
      pages: [],
      dashboards: [],
      workflows: [],
      fileNeeds: [],
      assumptions: [],
      exclusions: [],
      clarificationQuestions: [
        { id: "q_team_size", question: "Roughly how many people will use this app?", reason: "Affects whether per-user roles are needed." },
        { id: "q_domain", question: "What kind of team is this for (e.g. construction, software, events)?", reason: "Affects which fields tasks need." },
      ],
      confidence: "low",
    }),
    value({
      appPurpose: "Track tasks for a small software team, assigned to individual engineers with due dates.",
      targetUsers: ["Engineers", "Tech lead"],
      entities: [
        { name: "Task", purpose: "A unit of engineering work.", importantFields: [{ name: "title" }, { name: "due date" }, { name: "status" }] },
        { name: "Team Member", purpose: "An engineer.", importantFields: [{ name: "name" }] },
      ],
      relationships: [{ fromEntity: "Task", toEntity: "Team Member", cardinality: "oneToMany" }],
      roles: [],
      pages: [{ name: "Tasks", primaryEntity: "Task" }],
      dashboards: [],
      workflows: [],
      fileNeeds: [],
      assumptions: ["Small team (~8 engineers), no sub-teams."],
      exclusions: [],
      clarificationQuestions: [],
      confidence: "high",
    }),
  ],
  recommendTemplate: [
    value({
      templateId: "task_management",
      reasoningSummary: "Task tracking with assignees matches task_management once clarified.",
      confidence: "high",
    }),
  ],
  proposeOperations: [
    value({
      reasoningSummary: "No additive changes needed beyond the template for this small team.",
      isFinalBatch: true,
      operations: [],
    }),
  ],
};
