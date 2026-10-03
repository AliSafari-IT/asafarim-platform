// Synthetic Hub identities for the TasksAI end-user test catalog (#742).
//
// Testora signs in to TasksAI through Hub as one of these accounts, per role.
// They live in the shared platform database (Hub's user table); TasksAI
// itself only ever stores their opaque ids (apps/tasks-ai/scripts/test-data.ts
// reads them from the identities file the CLI writes — it never reads this
// database).
//
// Markers that make every row provably synthetic:
//   - id     `seed-tasksai-test-<key>`
//   - email  `tasksai-test+<key>@asafarim.test` (`.test` is reserved, RFC 6761:
//            it can never be a real mailbox)
// Removal only ever touches rows matching BOTH.

export const TASKSAI_IDENTITIES_DEFINITION_VERSION = "1.0.0";

export const TASKSAI_IDENTITY_ID_PREFIX = "seed-tasksai-test-";
export const TASKSAI_IDENTITY_EMAIL_DOMAIN = "asafarim.test";

/** The TasksAI membership role each identity is meant for (applied by the TasksAI script). */
export type TasksaiIdentityRole = "owner" | "admin" | "member" | "guest" | "outsider";

export interface TasksaiIdentityDefinition {
  /** Stable key: the id/email suffix and the key in the identities file. */
  key: string;
  role: TasksaiIdentityRole;
  name: string;
  /**
   * Part of the read-only remote-smoke baseline. Only these may be created on
   * production, and only by the owner (`--allow-production-baseline`).
   */
  productionBaseline: boolean;
}

export const TASKSAI_IDENTITIES: TasksaiIdentityDefinition[] = [
  { key: "owner", role: "owner", name: "TasksAI Test Owner", productionBaseline: false },
  { key: "admin", role: "admin", name: "TasksAI Test Admin", productionBaseline: false },
  { key: "member", role: "member", name: "TasksAI Test Member", productionBaseline: true },
  // A second member: tasks assigned to "another member", and two-session edits.
  { key: "member2", role: "member", name: "TasksAI Test Member 2", productionBaseline: false },
  { key: "guest", role: "guest", name: "TasksAI Test Guest", productionBaseline: false },
  // Signed in, but a member of no synthetic workspace: isolation checks.
  { key: "outsider", role: "outsider", name: "TasksAI Test Outsider", productionBaseline: false },
];

export function tasksaiIdentityId(key: string): string {
  return `${TASKSAI_IDENTITY_ID_PREFIX}${key}`;
}

export function tasksaiIdentityEmail(key: string): string {
  return `tasksai-test+${key}@${TASKSAI_IDENTITY_EMAIL_DOMAIN}`;
}

/**
 * Target-secret names (Testora's per-target secrets) for an identity's
 * credentials. Names only: the values exist in the git-ignored credentials
 * file and in Testora's encrypted target secrets, nowhere else.
 */
export function tasksaiIdentitySecretNames(key: string): { email: string; password: string } {
  const upper = key.toUpperCase();
  return { email: `TASKSAI_TEST_${upper}_EMAIL`, password: `TASKSAI_TEST_${upper}_PASSWORD` };
}

export const TASKSAI_IDENTITY_DEFINITIONS = {
  version: TASKSAI_IDENTITIES_DEFINITION_VERSION,
  identities: TASKSAI_IDENTITIES,
};
