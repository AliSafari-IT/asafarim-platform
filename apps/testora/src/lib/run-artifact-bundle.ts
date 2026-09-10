import { randomUUID } from "node:crypto";
import {
  RunArtifactBundle,
  TimelineStep,
  type ArtifactRef,
  type ErrorClass,
  type RunArtifactBundle as RunArtifactBundleType,
} from "@asafarim/testora-tasksai-contract";

/**
 * Maps one stored Testora result (joined to its case/fixture/suite/requirement)
 * into the versioned cross-app {@link RunArtifactBundle} that TasksAI reads to
 * diagnose a regression (issue #258).
 *
 * Pure and framework-free so it can be unit-tested without a DB or a request.
 * DOM snapshot / trace / video artifacts arrive with #259; until then only the
 * failure screenshot (if any) is attached.
 */

export interface BundleSourceRow {
  id: string;
  /** testResults.status — one of pending|running|passed|failed|error */
  status: string;
  runIndex: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  /** ISO timestamp */
  createdAt: string;
  details: Record<string, unknown> | null;
  caseId: string;
  caseTitle: string;
  fixtureId: string;
  fixtureTitle: string;
  suiteId: string;
  suiteTitle: string;
  requirementId: string;
  requirementTitle: string;
  /** app/project id resolved via the functional requirement */
  projectId: string;
  /** most recent passing run of the same case before this one, if any */
  previousPass: { resultId: string; createdAt: string } | null;
}

export class NonTerminalResultError extends Error {
  constructor(public readonly status: string) {
    super(`result status "${status}" is not terminal — no bundle can be built`);
    this.name = "NonTerminalResultError";
  }
}

const MAX_ERR = 5000;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function mapStatus(status: string): "passed" | "failed" {
  if (status === "passed") return "passed";
  if (status === "failed" || status === "error") return "failed";
  throw new NonTerminalResultError(status);
}

/** Best-effort bucket for the failure, from the error text. */
export function classifyError(message: string | null): ErrorClass | undefined {
  if (!message) return undefined;
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("timed out")) return "timeout";
  if (
    (m.includes("selector") || m.includes("element")) &&
    (m.includes("not found") || m.includes("no element") || m.includes("was not found") || m.includes("wasn't found"))
  ) {
    return "selector_not_found";
  }
  if (m.includes("net::") || m.includes("navigat") || m.includes("could not resolve") || m.includes("err_")) {
    return "navigation";
  }
  if (m.includes("network") || m.includes("request failed") || m.includes("fetch")) return "network";
  if (m.includes("assert") || m.includes("expected") || m.includes("to equal") || m.includes("to deep")) {
    return "assertion";
  }
  return "unknown";
}

function readString(source: Record<string, unknown> | null, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Screenshot / DOM / video pointers Testora currently keeps on `details`. */
function collectArtifacts(details: Record<string, unknown> | null): ArtifactRef[] {
  const artifacts: ArtifactRef[] = [];
  const screenshot = readString(details, "screenshot");
  if (screenshot) {
    artifacts.push({ kind: "screenshot", url: screenshot });
  }
  const domSnapshot = readString(details, "domSnapshot") ?? readString(details, "domSnapshotUrl");
  if (domSnapshot) {
    artifacts.push({ kind: "dom_snapshot", url: domSnapshot });
  }
  const video = readString(details, "videoRef") ?? readString(details, "videoUrl");
  if (video) {
    artifacts.push({ kind: "video", url: video });
  }
  return artifacts;
}

/** Forward-compatible: keep only entries that already match the contract step shape. */
function collectSteps(details: Record<string, unknown> | null): RunArtifactBundleType["steps"] {
  const raw = details?.steps;
  if (!Array.isArray(raw)) return [];
  const steps: RunArtifactBundleType["steps"] = [];
  for (const item of raw) {
    const parsed = TimelineStep.safeParse(item);
    if (parsed.success) steps.push(parsed.data);
  }
  return steps.slice(0, 2000);
}

export function buildRunArtifactBundle(
  row: BundleSourceRow,
  options: { bundleId?: string } = {},
): RunArtifactBundleType {
  const status = mapStatus(row.status);
  const finishedMs = Date.parse(row.createdAt);
  const duration = row.durationMs != null && row.durationMs >= 0 ? row.durationMs : 0;
  const startedMs = Number.isFinite(finishedMs) ? finishedMs - duration : finishedMs;

  const bundle: RunArtifactBundleType = {
    v: 1,
    bundleId: options.bundleId ?? randomUUID(),
    runId: readString(row.details, "runId") ?? row.id,
    scenarioId: row.caseId,
    scenarioTitle: row.caseTitle || row.caseId,
    appId: row.projectId || "unknown",
    status,
    attempt: (row.runIndex ?? 0) + 1,
    startedAt: new Date(Number.isFinite(startedMs) ? startedMs : Date.now()).toISOString(),
    finishedAt: new Date(Number.isFinite(finishedMs) ? finishedMs : Date.now()).toISOString(),
    steps: collectSteps(row.details),
    artifacts: collectArtifacts(row.details),
    context: {
      suiteId: row.suiteId || undefined,
      suiteTitle: row.suiteTitle || undefined,
      fixtureId: row.fixtureId || undefined,
      fixtureTitle: row.fixtureTitle || undefined,
      requirementId: row.requirementId || undefined,
      requirementTitle: row.requirementTitle || undefined,
      runIndex: row.runIndex,
      targetBaseUrl: readString(row.details, "targetBaseUrl") ?? null,
      previousPass: row.previousPass
        ? { resultId: row.previousPass.resultId, createdAt: row.previousPass.createdAt }
        : null,
    },
  };

  const browser = readString(row.details, "browser");
  if (browser) bundle.browser = truncate(browser, 120);

  const errorClass = classifyError(row.errorMessage);
  if (errorClass) bundle.errorClass = errorClass;
  if (row.errorMessage) bundle.errorMessage = truncate(row.errorMessage, MAX_ERR);

  // Defensive: never emit a bundle that would fail the shared contract.
  return RunArtifactBundle.parse(bundle);
}
