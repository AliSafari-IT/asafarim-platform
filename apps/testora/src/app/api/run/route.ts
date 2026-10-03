import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  loadFixtureRunPlan,
  loadSuiteRunPlan,
  loadRequirementRunPlan,
  loadSelectionRunPlan,
  loadAllRunPlan,
  type RunPlan,
} from "@/test-engine/executors/testExecutor";
import {
  createRun,
  setRunMeta,
  appendLog,
  scheduleRun,
  runnerMode,
  getActiveRunFor,
  getCapacity,
  runStore,
} from "@/test-engine/executors/runLog";
import { auth } from "@asafarim/auth";
import { getActiveProjectId } from "@/lib/active-project";
import { isProjectViewable } from "@/lib/app-access";
import { requireTester } from "@/lib/viewer-role";
import { isAdminRole } from "@/lib/access-policy";
import { resolveRunTarget } from "@/lib/run-target";
import { unitTargetsWeb } from "@/lib/web-target";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, targetEnvironments } from "@/db/schema";
import { loadTargetSecrets } from "@/lib/run-executor";
import { checkRunOwnership } from "@/lib/ownership";
import { planScopeError } from "@/lib/run-scope";
import {
  RATE_WINDOW_MS,
  rateLimitDecision,
  rateLimitKey,
  runsPerTargetPerHour,
} from "@/lib/run-rate-limit";

// Reads live run state, so it must never be statically cached.
export const dynamic = "force-dynamic";

// Lets a client that just (re)loaded discover ITS in-progress (or queued) run
// and re-attach to its stream, and shows who is using the test runners.
export async function GET() {
  const session = await auth();
  return NextResponse.json({
    active: await getActiveRunFor(session?.user?.id ?? null),
    capacity: await getCapacity(),
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
  // A private app's tests need a signed-in platform user (lib/app-access.ts).
  if (!(await isProjectViewable(projectId))) {
    return NextResponse.json(
      { error: "Sign in with your ASafariM account to run this app's tests." },
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
  // Every loaded fixture must belong to the run's project (#712) — access,
  // target, secrets and ownership were all checked against `projectId`.
  const scopeError = planScopeError(plan.units, projectId);
  if (scopeError) {
    return NextResponse.json(scopeError.body, { status: scopeError.status });
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

  // Ownership (#703): every web URL a fixture will hit must lie within its
  // app's verified domain — a non-ASafariM app is unrunnable until verified.
  // (The Hub URL may be a third-party SSO provider; it is network-policy
  // checked but not domain-bound.)
  const unitProjectIds = [...new Set(runnableUnits.map((unit) => unit.projectId ?? projectId))];
  const projectRows = await db
    .select({
      id: projects.id,
      seeded: projects.seeded,
      baseUrl: projects.baseUrl,
      verifiedAt: projects.verifiedAt,
    })
    .from(projects)
    .where(inArray(projects.id, unitProjectIds));
  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  for (const unit of runnableUnits) {
    const refusal = checkRunOwnership(projectById.get(unit.projectId ?? projectId), [
      unit.fixture.baseUrl,
      apiUrl,
    ]);
    if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });
  }

  // Per-target rate limit (#703).
  // Durable (#716): counted from the runs table, so a restart doesn't reset it.
  const rateKey = rateLimitKey(targetId, baseUrl ?? runnableUnits[0]?.fixture.baseUrl);
  const limited = rateLimitDecision(
    await runStore().recentRunTimes(rateKey, RATE_WINDOW_MS),
    runsPerTargetPerHour(),
  );
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: `Too many runs against this target in the last hour. Try again in ${Math.ceil(limited.retryAfterSec / 60)} minute(s).`,
        code: "TARGET_RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const runId = randomUUID();
  await createRun(
    runId,
    {
      id: session?.user?.id ?? null,
      name: session?.user?.name ?? session?.user?.email ?? null,
    },
    { projectId, targetId: targetId ?? null, rateKey },
  );

  const totalRuns = runnableUnits.reduce(
    (total, unit) =>
      total +
      unit.cases.reduce(
        (sum, c) => sum + (c.runs?.length ? c.runs.length : 1),
        0,
      ),
    0,
  );
  await setRunMeta(runId, totalRuns, plan.label);

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

  // At most TESTORA_MAX_CONCURRENT_RUNS runs drive a browser at once; anything
  // beyond waits in the durable FIFO queue (runLog/runStore) and starts
  // automatically — even after a restart. The job is frozen (encrypted) now.
  const admission = await scheduleRun(runId, {
    plan: { ...plan, units: runnableUnits },
    env: { baseUrl, apiUrl, hubUrl, targetName, secrets, secretsProjectId: projectId },
  });

  if (admission.status === "rejected") {
    return NextResponse.json(
      {
        error:
          "The test queue is full right now. Please try again once some of the queued runs have finished.",
      },
      { status: 429 },
    );
  }

  const capacity = await getCapacity();
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
          message:
            runnerMode() === "remote" && capacity.running.length < capacity.limit
              ? `Waiting for a test runner to pick it up — your run is #${admission.position} in the queue.`
              : `All ${capacity.limit} test runners are busy. Your run is #${admission.position} in the queue and will start automatically.`,
        }
      : { runId, status: "running" },
    { status: 202 },
  );
}
