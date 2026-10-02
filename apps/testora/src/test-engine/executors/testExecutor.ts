import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtureOrigin } from "@/test-engine/fixture-origin";
import { db } from "@/db/client";
import {
  functionalRequirements,
  testCases,
  testFixtures,
  testResults,
  testSuites,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateTestSpec } from "@/test-engine/generators/testGenerator";
import { resolveFixtureBaseUrl } from "@/test-engine/resolveFixtureBaseUrl";
import { captureFailureArtifacts } from "@/test-engine/artifacts";
import { runSpec } from "@/test-engine/executors/specRunner";
import { updateFlakeStateForRun } from "@/lib/flake-service";
import { enqueueRunCompleted, updateRegressionStateForRun } from "@/lib/run-events-service";
import { evaluateGreenLightForRun } from "@/lib/greenlight-service";
import type {
  TestCaseDefinition,
  TestFixtureDefinition,
  TestRunResult,
} from "@/test-engine/types";

export interface ExecuteFixtureOptions {
  browser?: string;
  headless?: boolean;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
  /**
   * API base for this run, exposed to the spec as process.env.WEBAPP_API_URL.
   * Scoped to this spec only (see specEnvPrelude) — never written to the
   * global env, because concurrent runs share this process.
   */
  apiUrl?: string;
  /**
   * The Hub the run's target signs in through, exposed to the spec as
   * process.env.TESTORA_TARGET_HUB_URL (Hub SSO scripts follow it, #700).
   */
  hubUrl?: string;
  /**
   * Whether scripts may create accounts (sign-up fallbacks): exposed as
   * TESTORA_TARGET_ALLOW_SIGNUP=1, set by the run route for local targets only.
   */
  allowSignup?: boolean;
  /**
   * Everything else the spec may read (#702): the target's secrets plus the
   * deprecated server-env fallback, built by lib/run-secrets.ts. The run's own
   * values below always win. Nothing from the server's process.env reaches
   * the spec except through here.
   */
  secretEnv?: Record<string, string>;
}

export async function executeFixture(
  fixture: TestFixtureDefinition,
  cases: TestCaseDefinition[],
  options: ExecuteFixtureOptions = {},
): Promise<TestRunResult[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "e2e-testora-"));
  const specPath = path.join(dir, `${fixture.fixtureId}.spec.js`);
  // TestCafe writes failure screenshots here; we read + inline them, then the
  // whole temp dir (specs + screenshots) is removed in `finally`.
  const screenshotsDir = path.join(dir, "screenshots");
  // Sidecar dirs for the richer failure artifacts added in #259: DOM snapshots
  // written by the injected __captureDom helper, and TestCafe videos when the
  // fixture opts in with metadata.recordVideo.
  const domDir = path.join(dir, "dom");
  const videoDir = path.join(dir, "video");
  // Per-run values are baked into this spec rather than process.env, so runs
  // executing concurrently in this process never see each other's values.
  const spec = generateTestSpec(fixture, cases, {
    ...options.secretEnv,
    TESTORA_DOM_DIR: domDir,
    WEBAPP_API_URL: options.apiUrl,
    // Where this run points (#700) — login scripts use these instead of the
    // server env, so a Local run never signs in on / lands on production.
    TESTORA_TARGET_BASE_URL: fixtureOrigin(fixture.baseUrl),
    TESTORA_TARGET_API_URL: options.apiUrl,
    TESTORA_TARGET_HUB_URL: options.hubUrl,
    TESTORA_TARGET_ALLOW_SIGNUP: options.allowSignup ? "1" : undefined,
  });
  await writeFile(specPath, spec, "utf8");

  let results: TestRunResult[];
  try {
    results = await runSpec({
      specPath,
      screenshotsDir,
      domDir,
      videoDir,
      fixture,
      cases,
      browser: options.browser,
      headless: options.headless,
      onLog: options.onLog,
      signal: options.signal,
      // In-process: failure artifacts go straight to object storage.
      uploadArtifacts: captureFailureArtifacts,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await recordFixtureResults(results, fixture.fixtureId);
  return results;
}

/**
 * Store one fixture's results and run the post-run hooks. Shared by the
 * in-process executor and the remote runner's complete call (#717).
 */
export async function recordFixtureResults(results: TestRunResult[], fixtureId: string): Promise<void> {
  await persistResults(results);
  // Flake + regression detection (#260/#261) run after persistence so the
  // just-inserted rows are part of the history they score against. Never
  // fails the run itself.
  await updateFlakeStateForRun(results).catch(() => {});
  await updateRegressionStateForRun(results).catch(() => {});
  await enqueueRunCompleted(results, fixtureId).catch(() => {});
  await evaluateGreenLightForRun(results).catch(() => {});
}


async function persistResults(results: TestRunResult[]): Promise<void> {
  if (results.length === 0) return;
  await db.insert(testResults).values(
    results.map((result) => ({
      id: result.id,
      caseId: result.caseId,
      status: result.status,
      runIndex: result.runIndex,
      durationMs: result.durationMs,
      details: result.details,
      errorMessage: result.errorMessage,
    })),
  );
}

export async function loadFixtureWithCases(fixtureId: string): Promise<{
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
} | null> {
  const fixtureRow = await db.query.testFixtures.findFirst({
    where: eq(testFixtures.fixtureId, fixtureId),
    with: { suite: { with: { functionalRequirement: true } } },
  });
  if (!fixtureRow) return null;

  const caseRows = await db.query.testCases.findMany({
    where: eq(testCases.fixtureId, fixtureId),
  });

  const fixture = mapFixtureRow(
    fixtureRow,
    fixtureRow.suite?.functionalRequirement?.baseUrl,
  );
  const cases = caseRows.map(mapCaseRow);

  return { fixture, cases };
}

// A single fixture-worth of work, annotated with its suite title so the
// aggregated report can attribute each case to the right suite.
export interface RunUnit {
  suiteTitle: string;
  /** The app the fixture belongs to (its requirement's projectId) — scopes secrets (#702). */
  projectId?: string | null;
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
}

export interface RunPlan {
  label: string;
  units: RunUnit[];
}

type FixtureRow = typeof testFixtures.$inferSelect;
type CaseRow = typeof testCases.$inferSelect;

function mapFixtureRow(
  row: FixtureRow,
  frBaseUrl: string | null | undefined,
): TestFixtureDefinition {
  return {
    fixtureId: row.fixtureId,
    suiteId: row.suiteId,
    title: row.title,
    baseUrl: resolveFixtureBaseUrl(frBaseUrl, row.baseUrl),
    commonInput: row.commonInput ?? {},
    setupScript: row.setupScript ?? undefined,
    teardownScript: row.teardownScript ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

function mapCaseRow(row: CaseRow): TestCaseDefinition {
  return {
    caseId: row.caseId,
    fixtureId: row.fixtureId,
    title: row.title,
    scriptType: row.scriptType,
    input: row.input ?? undefined,
    runs: row.runs ?? undefined,
    expected: row.expected ?? {},
    script: row.script ?? undefined,
  };
}

/** Build a one-fixture run plan. */
export async function loadFixtureRunPlan(
  fixtureId: string,
): Promise<RunPlan | null> {
  const fixtureRow = await db.query.testFixtures.findFirst({
    where: eq(testFixtures.fixtureId, fixtureId),
    with: { suite: { with: { functionalRequirement: true } }, cases: true },
  });
  if (!fixtureRow) return null;

  return {
    label: `fixture "${fixtureRow.title}"`,
    units: [
      {
        suiteTitle: fixtureRow.suite?.title ?? fixtureRow.suiteId,
        projectId: fixtureRow.suite?.functionalRequirement?.projectId ?? null,
        fixture: mapFixtureRow(
          fixtureRow,
          fixtureRow.suite?.functionalRequirement?.baseUrl,
        ),
        cases: fixtureRow.cases.map(mapCaseRow),
      },
    ],
  };
}

/** Build a run plan covering every fixture in a suite. */
export async function loadSuiteRunPlan(
  suiteId: string,
): Promise<RunPlan | null> {
  const suiteRow = await db.query.testSuites.findFirst({
    where: eq(testSuites.suiteId, suiteId),
    with: { functionalRequirement: true, fixtures: { with: { cases: true } } },
  });
  if (!suiteRow) return null;

  const frBaseUrl = suiteRow.functionalRequirement?.baseUrl;
  return {
    label: `suite "${suiteRow.title}"`,
    units: suiteRow.fixtures.map((fixtureRow) => ({
      suiteTitle: suiteRow.title,
      projectId: suiteRow.functionalRequirement?.projectId ?? null,
      fixture: mapFixtureRow(fixtureRow, frBaseUrl),
      cases: fixtureRow.cases.map(mapCaseRow),
    })),
  };
}

/**
 * Build a run plan from an explicit set of (fixture, case) selections — the
 * basis for "rerun failed". The selections may span any number of fixtures and
 * suites (whatever scope the original run covered); they are grouped per
 * fixture, deduped, and any ids no longer present are silently skipped.
 */
export async function loadSelectionRunPlan(
  selections: { fixtureId: string; caseId: string }[],
): Promise<RunPlan | null> {
  const caseIdsByFixture = new Map<string, Set<string>>();
  for (const { fixtureId, caseId } of selections) {
    const set = caseIdsByFixture.get(fixtureId) ?? new Set<string>();
    set.add(caseId);
    caseIdsByFixture.set(fixtureId, set);
  }

  const units: RunUnit[] = [];
  for (const [fixtureId, caseIds] of caseIdsByFixture) {
    const fixtureRow = await db.query.testFixtures.findFirst({
      where: eq(testFixtures.fixtureId, fixtureId),
      with: { suite: { with: { functionalRequirement: true } }, cases: true },
    });
    if (!fixtureRow) continue;

    const cases = fixtureRow.cases
      .filter((row) => caseIds.has(row.caseId))
      .map(mapCaseRow);
    if (cases.length === 0) continue;

    units.push({
      suiteTitle: fixtureRow.suite?.title ?? fixtureRow.suiteId,
      projectId: fixtureRow.suite?.functionalRequirement?.projectId ?? null,
      fixture: mapFixtureRow(
        fixtureRow,
        fixtureRow.suite?.functionalRequirement?.baseUrl,
      ),
      cases,
    });
  }

  if (units.length === 0) return null;
  const total = units.reduce((sum, unit) => sum + unit.cases.length, 0);
  return { label: `${total} selected case(s)`, units };
}

/** Build a run plan covering every fixture across every suite of a requirement. */
export async function loadRequirementRunPlan(
  frId: string,
): Promise<RunPlan | null> {
  const frRow = await db.query.functionalRequirements.findFirst({
    where: eq(functionalRequirements.id, frId),
    with: { suites: { with: { fixtures: { with: { cases: true } } } } },
  });
  if (!frRow) return null;

  const units: RunUnit[] = [];
  for (const suiteRow of frRow.suites) {
    for (const fixtureRow of suiteRow.fixtures) {
      units.push({
        suiteTitle: suiteRow.title,
        projectId: frRow.projectId,
        fixture: mapFixtureRow(fixtureRow, frRow.baseUrl),
        cases: fixtureRow.cases.map(mapCaseRow),
      });
    }
  }

  return { label: `requirement "${frRow.title}"`, units };
}

/** Build a run plan covering every fixture of every functional requirement. */
export async function loadAllRunPlan(
  projectId?: string,
): Promise<RunPlan | null> {
  const frRows = await db.query.functionalRequirements.findMany({
    where: projectId
      ? eq(functionalRequirements.projectId, projectId)
      : undefined,
    with: { suites: { with: { fixtures: { with: { cases: true } } } } },
  });

  const units: RunUnit[] = [];
  for (const frRow of frRows) {
    for (const suiteRow of frRow.suites) {
      for (const fixtureRow of suiteRow.fixtures) {
        units.push({
          suiteTitle: suiteRow.title,
          projectId: frRow.projectId,
          fixture: mapFixtureRow(fixtureRow, frRow.baseUrl),
          cases: fixtureRow.cases.map(mapCaseRow),
        });
      }
    }
  }

  if (units.length === 0) return null;
  const scope = projectId ? `${projectId} ` : "";
  return { label: `all ${scope}requirements (${frRows.length})`, units };
}
