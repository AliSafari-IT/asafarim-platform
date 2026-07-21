export interface FunctionalRequirementDefinition {
  id: string;
  /** App/project this requirement belongs to (see src/data/projects.ts). */
  projectId?: string;
  title: string;
  description: string;
  // Environment root shared by every fixture under this FR's suites (e.g.
  // http://localhost:3233 or https://app.example.com). See resolveFixtureBaseUrl().
  baseUrl?: string;
}

export interface TestSuiteDefinition {
  suiteId: string;
  frId: string;
  title: string;
  description: string;
}

export interface TestFixtureDefinition {
  fixtureId: string;
  suiteId: string;
  title: string;
  baseUrl?: string;
  commonInput: Record<string, unknown>;
  setupScript?: string;
  teardownScript?: string;
  // Free-form flags carried from the DB. `destructive: true` marks a fixture
  // that creates/mutates real data, so the runner can refuse to run it against
  // a non-local (web) deployment.
  metadata?: Record<string, unknown>;
}

export type ScriptType = "single" | "multi" | "scripted";

export interface TestCaseDefinition {
  caseId: string;
  fixtureId: string;
  title: string;
  scriptType: ScriptType;
  input?: Record<string, unknown>;
  runs?: Record<string, unknown>[];
  expected: Record<string, unknown>;
  // Raw TestCafe test body, used only when scriptType is "scripted".
  script?: string;
}

export type TestStatus = "pending" | "running" | "passed" | "failed" | "error";

export interface TestRunResult {
  id: string;
  caseId: string;
  status: TestStatus;
  runIndex: number | null;
  durationMs: number | null;
  details: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
}

export interface FormattedReport {
  suite: string;
  fixture: string;
  // Stable ids alongside the human titles, so a client can re-target exactly
  // these cases (e.g. "rerun failed") regardless of the original run's scope.
  fixtureId: string;
  caseId: string;
  case: string;
  status: TestStatus;
  details: Record<string, unknown>;
}
