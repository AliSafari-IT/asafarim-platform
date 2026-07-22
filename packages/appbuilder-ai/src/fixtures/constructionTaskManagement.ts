import { value, type FakeProviderScript } from "../providers/fake";

/**
 * Deterministic success fixture: "Build me a task manager for my
 * construction crew to track projects, tasks, and who's assigned to them."
 * Produces a small but complete task_management-shaped specification via
 * a single operation batch — entities, relations, a role, permissions, a
 * page with two components, and navigation. Used by unit tests, the
 * generation-pipeline integration test, and the Playwright golden path.
 */
export const CONSTRUCTION_TASK_MANAGEMENT_SCRIPT: FakeProviderScript = {
  analyzeRequirements: [
    value({
      appPurpose: "Track construction projects, the tasks within them, and which team member is assigned to each task.",
      targetUsers: ["Site managers", "Crew leads"],
      entities: [
        {
          name: "Project",
          purpose: "A construction site or job.",
          importantFields: [{ name: "name" }, { name: "status" }, { name: "site address" }],
        },
        {
          name: "Task",
          purpose: "A unit of work within a project.",
          importantFields: [{ name: "title" }, { name: "due date" }, { name: "status" }],
        },
        {
          name: "Team Member",
          purpose: "A crew member who can be assigned tasks.",
          importantFields: [{ name: "name" }, { name: "role" }],
        },
      ],
      relationships: [
        { fromEntity: "Task", toEntity: "Project", cardinality: "oneToMany", description: "A task belongs to one project." },
        { fromEntity: "Task", toEntity: "Team Member", cardinality: "oneToMany", description: "A task is assigned to one team member." },
      ],
      roles: [{ name: "Crew Lead", accessSummary: "Can create and manage tasks." }],
      pages: [{ name: "Tasks", purpose: "List and manage tasks.", primaryEntity: "Task" }],
      dashboards: [{ name: "Overview", purpose: "At-a-glance project/task counts." }],
      workflows: [],
      fileNeeds: [],
      assumptions: ["Single-company use — no multi-tenant billing needed."],
      exclusions: ["Payroll and invoicing are out of scope."],
      clarificationQuestions: [],
      confidence: "high",
    }),
  ],
  recommendTemplate: [
    value({
      templateId: "task_management",
      reasoningSummary: "The request describes projects, tasks, and a team roster — a direct match for the task_management starter.",
      confidence: "high",
    }),
  ],
  proposeOperations: [
    value({
      reasoningSummary:
        "Adds a site-address field to Project, a Crew Lead role with task permissions, and a Tasks page listing/creating tasks.",
      isFinalBatch: true,
      operations: [
        {
          modelBelievesDestructive: false,
          operation: {
            opVersion: "1.0.0",
            type: "ADD_FIELD",
            entityId: "project",
            field: {
              id: "site_address",
              machineName: "site_address",
              name: "Site address",
              required: false,
              unique: false,
              archived: false,
              type: "text",
            },
          },
        },
        {
          modelBelievesDestructive: false,
          operation: {
            opVersion: "1.0.0",
            type: "CREATE_ROLE",
            role: { id: "crew_lead", name: "Crew Lead", description: "Can create and manage tasks." },
          },
        },
        {
          modelBelievesDestructive: false,
          operation: {
            opVersion: "1.0.0",
            type: "SET_PERMISSION",
            permission: { id: "crew_lead_task_create", roleId: "crew_lead", entityId: "task", verb: "create", effect: "allow" },
          },
        },
        {
          modelBelievesDestructive: false,
          operation: {
            opVersion: "1.0.0",
            type: "SET_PERMISSION",
            permission: { id: "crew_lead_task_update", roleId: "crew_lead", entityId: "task", verb: "update", effect: "allow" },
          },
        },
      ],
    }),
  ],
};
