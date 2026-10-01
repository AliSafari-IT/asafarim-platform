import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  executeFixture,
  loadFixtureRunPlan,
  loadSuiteRunPlan,
  loadRequirementRunPlan,
  loadSelectionRunPlan,
  loadAllRunPlan,
  type RunPlan,
} from "@/test-engine/executors/testExecutor";
import { toJsonReport } from "@/test-engine/formatters/resultFormatter";
import {
  createRun,
  setRunMeta,
  appendLog,
  completeRun,
  failRun,
  getRun,
  scheduleRun,
  getActiveRunFor,
  getCapacity,
} from "@/test-engine/executors/runLog";
import { auth } from "@asafarim/auth";
import type { FormattedReport } from "@/test-engine/types";
import { getActiveProjectId } from "@/lib/active-project";
import { isProjectViewable } from "@/lib/app-access";
import { requireTester } from "@/lib/viewer-role";
import { isAdminRole } from "@/lib/access-policy";
import { resolveRunTarget } from "@/lib/run-target";
import { TargetPolicyError, assertRunnableTarget } from "@/lib/target-policy";
import { unitTargetsWeb } from "@/lib/web-target";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, targetEnvironments, targetSecrets } from "@/db/schema";
import { decryptToken } from "@/lib/crypto";
import { buildRunSpecEnv } from "@/lib/run-secrets";

// Reads live in-memory run state, so it must never be statically cached.
export const dynamic = "force-dynamic";

// Lets a client that just (re)loaded discover ITS in-progress (or queued) run
// and re-attach to its stream, and shows who is using the test runners.
export async function GET() {
  const session = await auth();
  return NextResponse.json({
    active: getActiveRunFor(session?.user?.id ?? null),
    capacity: getCapacity(),
  });
}

// A run can be scoped to a single fixture, a whole suite, a whole functional
// requirement (every fixture beneath it), every requirement at once, an explicit
// set of cases (the basis for "rerun failed"), or only UI / heavy fixtures.
// Exactly one shape is given.
const requestSchema = z.union([
  z.object({ fixtureId: z.string().min(1) }),
  z.object({ suiteId: z.string().min(1) }),
  z.object({ frId: z.string().min(1) }),
  z.object({ all: z.literal(true) }),
  z.object({ ui: z.literal(true) }),
  z.object({ heavy: z.literal(true) }),
  z.object({
    cases: z
      .array(
        z.object({ fixtureId: z.string().min(1), caseId: z.string().min(1) }),
      )
      .min(1),
  }),
]);

// Optional per-run "base scope" — point the whole run at a different frontend
// origin and/or API base (local vs. production vs. …) without editing any test
// content. The body names a stored target (`targetId`); raw `baseUrl`/`apiUrl`
// are admin-only (lib/run-target.ts). `baseUrl` retargets every fixture's page
// origin; `apiUrl` is exposed to the scripts' t.request calls (they already
// read process.env.WEBAPP_API_URL).

type RunUnit = RunPlan["units"][number];

/** Swap a resolved URL's origin for the override's, keeping path/query/hash. */
function retargetOrigin(
  url: string | undefined,
  overrideBase: string,
): string | undefined {
  if (!url) return url;
  try {
    const origin = new URL(overrideBase).origin;
    if (url.startsWith("/")) return origin + url;
    const u = new URL(url);
    return origin + u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}

function retargetUnit(unit: RunUnit, baseUrl: string): RunUnit {
  return {
    ...unit,
    fixture: {
      ...unit.fixture,
      baseUrl: retargetOrigin(unit.fixture.baseUrl, baseUrl),
    },
  };
}

function isDestructive(unit: RunUnit): boolean {
  return unit.fixture.metadata?.destructive === true;
}

function isHeavy(unit: RunUnit): boolean {
  return unit.fixture.metadata?.heavy === true;
}

function isUi(unit: RunUnit): boolean {
  return unit.fixture.metadata?.ui === true;
}

export async function POST(request: Request) {
  const denied = await requireTester();
  if (denied) return denied;
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  // Scope an "all requirements" run to the active app. Prefer the project the
  // client sent, but fall back to the active-project cookie (set by the app
  // badge/selector) so the run is always scoped even if the body omits it.
  const bodyProjectId =
    body && typeof body === "object" && typeof body.projectId === "string"
      ? body.projectId
      : undefined;
  const projectId = bodyProjectId || (await getActiveProjectId());
  // A locked private app's tests can't be run without unlocking it first.
  if (!(await isProjectViewable(projectId))) {
    return NextResponse.json(
      { error: "This app is locked. Unlock it with its key to run its tests." },
      { status: 403 },
    );
  }

  // Where the run points: a stored target of this app, or (admins only) raw
  // URLs — both through the network policy (lib/target-policy.ts).
  const session = await auth();
  const isAdmin = isAdminRole(session?.user?.roles ?? []);
  const resolved = await resolveRunTarget(body, {
    projectId,
    isAdmin,
    findTarget: (id) =>
      db.query.targetEnvironments.findFirst({ where: eq(targetEnvironments.id, id) }),
    storedUrlPairs: async () => {
      const [targets, project] = await Promise.all([
        db
          .select({
            id: targetEnvironments.id,
            baseUrl: targetEnvironments.baseUrl,
            apiUrl: targetEnvironments.apiUrl,
            hubUrl: targetEnvironments.hubUrl,
          })
          .from(targetEnvironments)
          .where(eq(targetEnvironments.projectId, projectId)),
        db.query.projects.findFirst({ where: eq(projects.id, projectId) }),
      ]);
      return project ? [...targets, { baseUrl: project.baseUrl, apiUrl: project.apiUrl }] : targets;
    },
  });
  if (!resolved.ok) {
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
  const { baseUrl, apiUrl, hubUrl, targetName, targetId } = resolved.target;
  // The target's test credentials (#702), decrypted server-side for this run
  // only; they reach the spec as its process.env / {{NAME}} placeholders.
  const secrets = targetId ? await loadTargetSecrets(targetId) : {};
  const isAllScope = "all" in data;
  const isUiScope = "ui" in data;
  const isHeavyScope = "heavy" in data;
  const plan =
    isAllScope || isUiScope || isHeavyScope
      ? await loadAllRunPlan(projectId)
      : "fixtureId" in data
        ? await loadFixtureRunPlan(data.fixtureId)
        : "suiteId" in data
          ? await loadSuiteRunPlan(data.suiteId)
          : "frId" in data
            ? await loadRequirementRunPlan(data.frId)
            : await loadSelectionRunPlan(data.cases);

  if (!plan) {
    return NextResponse.json(
      { error: "Run target not found" },
      { status: 404 },
    );
  }

  let runnableUnits = plan.units.filter((unit) => unit.cases.length > 0);
  if (runnableUnits.length === 0) {
    return NextResponse.json(
      { error: "No test cases to run for this selection" },
      { status: 400 },
    );
  }

  if (baseUrl)
    runnableUnits = runnableUnits.map((unit) => retargetUnit(unit, baseUrl));

  // Guard rail: destructive fixtures (create accounts, post questions/quotes,
  // mutate credits) must never run against a web deployment — only local.
  // Judged per fixture on where it will actually point (its retargeted page
  // origin and the API), since the seeds' own URLs are production (#701).
  const skippedDestructive = runnableUnits
    .filter((unit) => isDestructive(unit) && unitTargetsWeb(unit, apiUrl))
    .map((unit) => unit.fixture.title);
  if (skippedDestructive.length > 0) {
    runnableUnits = runnableUnits.filter(
      (unit) => !(isDestructive(unit) && unitTargetsWeb(unit, apiUrl)),
    );
    if (runnableUnits.length === 0) {
      return NextResponse.json(
        {
          error: `Blocked: this run only contains data-mutating fixtures (${skippedDestructive.join(
            ", ",
          )}), which can't run against a web deployment${baseUrl ? ` (${baseUrl})` : ""}. Switch the target to Local.`,
        },
        { status: 400 },
      );
    }
  }

  // Heavy live fixtures (video generation, real network scrapes) are slow and
  // overload the backend, cascading into login timeouts on later fixtures. Skip
  // them in an "All requirements" run unless explicitly opted in — they stay
  // runnable on their own (or via the include toggle). UI and heavy scopes run
  // *only* those tagged fixtures.
  const includeHeavy = body && typeof body === "object" && body.includeHeavy === true;
  const includeUi = body && typeof body === "object" && body.includeUi === true;
  let skippedHeavy: string[] = [];
  let skippedUiCount = 0;
  if (isUiScope) {
    runnableUnits = runnableUnits.filter(isUi);
    plan.label = "UI smokes";
  } else if (isHeavyScope) {
    runnableUnits = runnableUnits.filter(isHeavy);
    plan.label = "Heavy live fixtures";
  } else if (isAllScope) {
    if (!includeHeavy) {
      skippedHeavy = runnableUnits.filter(isHeavy).map((unit) => unit.fixture.title);
      runnableUnits = runnableUnits.filter((unit) => !isHeavy(unit));
    }
    // Browser UI smokes are slow (Chrome launch + login each) — skip them in an
    // "All requirements" run by default so it's a fast API-only health check.
    if (!includeUi) {
      const before = runnableUnits.length;
      runnableUnits = runnableUnits.filter((unit) => !isUi(unit));
      skippedUiCount = before - runnableUnits.length;
    }
  }

  const runId = randomUUID();
  createRun(runId, {
    id: session?.user?.id ?? null,
    name: session?.user?.name ?? session?.user?.email ?? null,
  });

  const totalRuns = runnableUnits.reduce(
    (total, unit) =>
      total +
      unit.cases.reduce(
        (sum, c) => sum + (c.runs?.length ? c.runs.length : 1),
        0,
      ),
    0,
  );
  setRunMeta(runId, totalRuns, plan.label);

  if (skippedDestructive.length > 0) {
    appendLog(
      runId,
      `⚠ Skipped ${skippedDestructive.length} data-mutating (destructive) fixture(s) on a web target${baseUrl ? ` (${baseUrl})` : ""}: ${skippedDestructive.join(", ")}`,
    );
  }
  if (skippedHeavy.length > 0) {
    appendLog(
      runId,
      `⚠ Skipped ${skippedHeavy.length} heavy live fixture(s) — run them individually, or enable "Include heavy live fixtures": ${skippedHeavy.join(", ")}`,
    );
  }
  if (skippedUiCount > 0) {
    appendLog(
      runId,
      `⚠ Skipped ${skippedUiCount} browser/UI fixture(s) — this is an API-only run. Enable "Include UI smokes" to run them too.`,
    );
  }

  // At most TESTORA_MAX_CONCURRENT_RUNS runs drive a browser at once (see
  // runLog/runScheduler); anything beyond waits in a FIFO queue and starts
  // automatically — the client is told it is queued and where.
  const admission = scheduleRun(runId, () =>
    runInBackground(
      runId,
      { ...plan, units: runnableUnits },
      { baseUrl, apiUrl, hubUrl, targetName, secrets, secretsProjectId: projectId },
    ),
  );

  if (admission.status === "rejected") {
    return NextResponse.json(
      {
        error:
          "The test queue is full right now. Please try again once some of the queued runs have finished.",
      },
      { status: 429 },
    );
  }

  const capacity = getCapacity();
  return NextResponse.json(
    admission.status === "queued"
      ? {
          runId,
          status: "queued",
          queue: {
            position: admission.position,
            running: capacity.running.length,
            limit: capacity.limit,
          },
          message: `All ${capacity.limit} test runners are busy. Your run is #${admission.position} in the queue and will start automatically.`,
        }
      : { runId, status: "running" },
    { status: 202 },
  );
}

async function runInBackground(
  runId: string,
  plan: RunPlan,
  env: RunEnv,
): Promise<void> {
  try {
    const totalCases = plan.units.reduce(
      (total, unit) => total + unit.cases.length,
      0,
    );
    appendLog(
      runId,
      `Starting run for ${plan.label} — ${plan.units.length} fixture(s), ${totalCases} case(s)...`,
    );
    if (env.baseUrl || env.apiUrl) {
      appendLog(
        runId,
        `Target${env.targetName ? ` "${env.targetName}"` : ""}: site ${env.baseUrl ?? "(default)"}${env.apiUrl ? `, API ${env.apiUrl}` : ""}${env.hubUrl ? `, Hub ${env.hubUrl}` : ""}`,
      );
    }

    if (Object.keys(env.secrets).length > 0) {
      appendLog(runId, `Target secrets: ${Object.keys(env.secrets).sort().join(", ")}`);
    }

    const run = getRun(runId);
    const signal = run?.abortController.signal;
    const reports: FormattedReport[] = [];
    const deprecated = new Set<string>();

    for (const unit of plan.units) {
      if (signal?.aborted) break;
      if (plan.units.length > 1) {
        appendLog(
          runId,
          `── Fixture: ${unit.fixture.title} (${unit.cases.length} case(s)) ──`,
        );
      }
      try {
        // Re-check the network policy right before the browser starts: the
        // admission check may be minutes old (queued run), and a fixture's own
        // URL (no override) hasn't been checked yet.
        await assertUnitTargets(unit, env.apiUrl, env.hubUrl);
        // Only the run's target secrets (for fixtures of the target's own app),
        // the run's values and — deprecated, seeded ASafariM apps only — their
        // server-env credentials. Never the rest of process.env.
        const specEnv = buildRunSpecEnv({
          projectId: unit.projectId,
          targetSecrets: unit.projectId === env.secretsProjectId ? env.secrets : {},
          runValues: {},
          serverEnv: process.env,
        });
        for (const name of specEnv.deprecatedFallback) {
          if (!deprecated.has(name)) {
            deprecated.add(name);
            appendLog(
              runId,
              `⚠ Deprecated: ${name} came from the server environment — store it as a target secret instead.`,
            );
          }
        }
        reports.push(...(await runUnitWithRetry(runId, unit, signal, env, specEnv.env)));
      } catch (error) {
        if (signal?.aborted) break;
        // A fixture that can't even start its browser shouldn't sink the whole
        // run — record its cases as errored and carry on to the next fixture.
        const message =
          error instanceof Error ? error.message : "Fixture failed to run";
        appendLog(
          runId,
          `✖ Fixture "${unit.fixture.title}" could not run: ${message}`,
        );
        reports.push(...errorReports(unit, message));
      }
    }

    appendLog(runId, `Run complete: ${reports.length} case(s) executed.`);
    completeRun(runId, reports);
  } catch (error) {
    const run = getRun(runId);
    if (!run?.done) {
      failRun(runId, error instanceof Error ? error.message : "Run failed");
    }
  }
}

interface RunEnv {
  baseUrl?: string;
  apiUrl?: string;
  hubUrl?: string;
  targetName?: string;
  /** Decrypted secrets of the run's target. */
  secrets: Record<string, string>;
  /** The project those secrets belong to — they only reach that app's fixtures. */
  secretsProjectId: string;
}

/** A target's secrets, decrypted (rows that fail to decrypt are skipped). */
async function loadTargetSecrets(targetId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ name: targetSecrets.name, valueEnc: targetSecrets.valueEnc })
    .from(targetSecrets)
    .where(eq(targetSecrets.targetId, targetId));
  const out: Record<string, string> = {};
  for (const row of rows) {
    const value = decryptToken(row.valueEnc);
    if (value !== null) out[row.name] = value;
  }
  return out;
}

/** Throws (TargetPolicyError) when a fixture's page or API origin is not runnable. */
async function assertUnitTargets(
  unit: RunUnit,
  apiUrl: string | undefined,
  hubUrl: string | undefined,
): Promise<void> {
  for (const url of [unit.fixture.baseUrl, apiUrl, hubUrl]) {
    // Relative/empty URLs resolve against an origin that was already checked.
    if (!url || !/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
    try {
      await assertRunnableTarget(url, { isAdmin: true, stored: true });
    } catch (error) {
      if (error instanceof TargetPolicyError) {
        throw new Error(`Blocked by the target policy — ${error.message}`);
      }
      throw error;
    }
  }
}

// Browser launch is the flaky step (esp. when many fixtures run in sequence in
// the dev server). Retry once on a connection/launch failure with a short pause.
async function runUnitWithRetry(
  runId: string,
  unit: RunPlan["units"][number],
  signal: AbortSignal | undefined,
  env: { apiUrl?: string; hubUrl?: string },
  secretEnv: Record<string, string>,
): Promise<FormattedReport[]> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const results = await executeFixture(unit.fixture, unit.cases, {
        onLog: (line) => appendLog(runId, line),
        signal,
        // Scoped to this run's spec — concurrent runs share this process.
        apiUrl: env.apiUrl,
        hubUrl: env.hubUrl,
        // Creating accounts (sign-up fallbacks) only against local targets.
        allowSignup: !unitTargetsWeb(unit, env.apiUrl),
        secretEnv,
      });
      return toJsonReport(unit.suiteTitle, unit.fixture, unit.cases, results);
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const launchFailed =
        /establish.*browser connection|browser connection|unable to establish|browser disconnected/i.test(
          message,
        );
      if (launchFailed && attempt < maxAttempts) {
        appendLog(
          runId,
          `Browser did not start for "${unit.fixture.title}" (attempt ${attempt}/${maxAttempts}). Retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 4000));
        continue;
      }
      throw error;
    }
  }
  return [];
}

// Synthesize error reports for a fixture whose browser never started, so the
// failure is visible in the results (and rerunnable via "rerun failed").
function errorReports(
  unit: RunPlan["units"][number],
  message: string,
): FormattedReport[] {
  return unit.cases.map((testCase) => ({
    suite: unit.suiteTitle,
    fixture: unit.fixture.title,
    fixtureId: unit.fixture.fixtureId,
    caseId: testCase.caseId,
    case: testCase.title,
    status: "error" as const,
    details: { errorMessage: message },
  }));
}
