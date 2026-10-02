import { generateTestSpec } from "@/test-engine/generators/testGenerator";
import { fixtureOrigin } from "@/test-engine/fixture-origin";
import { buildRunSpecEnv } from "@/lib/run-secrets";
import { unitTargetsWeb } from "@/lib/web-target";
import type { RunJob } from "@/lib/run-executor";
import type { TestCaseDefinition, TestFixtureDefinition } from "@/test-engine/types";

/**
 * The job envelope (#717, ADR 0004 §2): everything one run needs on the
 * isolated runner, and nothing more — generated specs (the web app keeps the
 * generator, seeds and all policies), the per-run env (the target's secrets
 * per #702 + the run's TESTORA_* values), advisory allowed origins, limits and
 * browser flags. No catalog, no DB rows, no server env.
 */

/** The runner swaps this for each unit's own DOM-snapshot directory. */
export const DOM_DIR_PLACEHOLDER = "__TESTORA_DOM_DIR__";
export const ENVELOPE_VERSION = 1;

/** Keys that differ per fixture — baked into that fixture's spec, not the job env. */
const PER_UNIT_KEYS = ["TESTORA_DOM_DIR", "TESTORA_TARGET_BASE_URL", "TESTORA_TARGET_ALLOW_SIGNUP"];

export interface RunnerEnvelopeUnit {
  suiteTitle: string;
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
  /** Generated TestCafe source, with DOM_DIR_PLACEHOLDER and the scenario-runner placeholder. */
  spec: string;
}

export interface RunnerEnvelope {
  version: typeof ENVELOPE_VERSION;
  jobId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  label: string;
  /** EXACTLY what the child process's env may hold (plus OS basics the runner adds). */
  env: Record<string, string>;
  units: RunnerEnvelopeUnit[];
  allowedOrigins: string[];
  limits: { timeoutMs: number; maxArtifactBytes: number };
  browser: { flags: string[] };
}

export const DEFAULT_BROWSER_FLAGS = ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"];

function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildRunnerEnvelope(input: {
  runId: string;
  leaseToken: string;
  leaseExpiresAt: Date;
  job: RunJob;
  /** Source of the deprecated ASafariM fallback only (lib/run-secrets.ts). */
  serverEnv: Record<string, string | undefined>;
  timeoutMs: number;
  maxArtifactBytes: number;
}): { envelope: RunnerEnvelope; deprecatedFallback: string[] } {
  const { job } = input;
  const { env: runEnv } = job;

  const allowedOrigins = [
    ...new Set(
      [...job.plan.units.map((unit) => originOf(unit.fixture.baseUrl)), originOf(runEnv.apiUrl), originOf(runEnv.hubUrl)].filter(
        (o): o is string => o !== null,
      ),
    ),
  ];

  const deprecated = new Set<string>();
  const jobEnv: Record<string, string> = {};
  const units: RunnerEnvelopeUnit[] = job.plan.units.map((unit) => {
    const specEnv = buildRunSpecEnv({
      projectId: unit.projectId,
      targetSecrets: unit.projectId === runEnv.secretsProjectId ? runEnv.secrets : {},
      runValues: {},
      serverEnv: input.serverEnv,
    });
    specEnv.deprecatedFallback.forEach((name) => deprecated.add(name));
    const unitEnv: Record<string, string | undefined> = {
      ...specEnv.env,
      TESTORA_DOM_DIR: DOM_DIR_PLACEHOLDER,
      WEBAPP_API_URL: runEnv.apiUrl,
      TESTORA_TARGET_BASE_URL: fixtureOrigin(unit.fixture.baseUrl),
      TESTORA_TARGET_API_URL: runEnv.apiUrl,
      TESTORA_TARGET_HUB_URL: runEnv.hubUrl,
      TESTORA_TARGET_ALLOW_SIGNUP: unitTargetsWeb(unit, runEnv.apiUrl) ? undefined : "1",
    };
    for (const [key, value] of Object.entries(unitEnv)) {
      if (value !== undefined && !PER_UNIT_KEYS.includes(key)) jobEnv[key] = value;
    }
    return {
      suiteTitle: unit.suiteTitle,
      fixture: unit.fixture,
      cases: unit.cases,
      spec: generateTestSpec(unit.fixture, unit.cases, unitEnv, { allowedOrigins, portableRunnerPath: true }),
    };
  });

  return {
    envelope: {
      version: ENVELOPE_VERSION,
      jobId: input.runId,
      leaseToken: input.leaseToken,
      leaseExpiresAt: input.leaseExpiresAt.toISOString(),
      label: job.plan.label,
      env: jobEnv,
      units,
      allowedOrigins,
      limits: { timeoutMs: input.timeoutMs, maxArtifactBytes: input.maxArtifactBytes },
      browser: { flags: DEFAULT_BROWSER_FLAGS },
    },
    deprecatedFallback: [...deprecated],
  };
}
