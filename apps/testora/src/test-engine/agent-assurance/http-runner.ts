import { randomUUID } from "node:crypto";
import {
  HttpAgentRunRequest,
  evaluateRun,
  parseAgentRunEvidence,
  parseHttpAgentRunResponse,
  type AgentOperationalContract,
  type AgentRunEvidence,
  type EvaluationReport,
} from "@asafarim/agent-assurance-contract";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface HttpAssuranceTarget {
  url: string;
  /** Runtime-only headers. They are never copied into evidence or errors. */
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface RunHttpAssuranceOptions {
  contract: AgentOperationalContract;
  scenarioId: string;
  target: HttpAssuranceTarget;
  /**
   * Required SSRF/trust-boundary hook. The caller must reject targets outside
   * the current tenant's allowlist before any network request is made.
   */
  authorizeTarget: (url: URL) => void | Promise<void>;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  runId?: string;
  now?: () => Date;
}

export interface HttpAssuranceRun {
  evidence: AgentRunEvidence;
  evaluation: EvaluationReport;
}

function positiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  }
  return resolved;
}

function parseTarget(raw: string): URL {
  const target = new URL(raw);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("assurance target must use http or https");
  }
  if (target.username || target.password) {
    throw new Error("assurance target URL must not contain credentials");
  }
  target.hash = "";
  return target;
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw new Error("assurance target response exceeds the configured limit");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new Error(
          "assurance target response exceeds the configured limit"
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function combineSignals(
  timeoutMs: number,
  externalSignal?: AbortSignal
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("assurance target timed out")),
    timeoutMs
  );
  timeout.unref?.();

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    onExternalAbort();
  } else {
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

export async function runHttpAssuranceScenario(
  options: RunHttpAssuranceOptions
): Promise<HttpAssuranceRun> {
  const scenario = options.contract.scenarios.find(
    (candidate) => candidate.id === options.scenarioId
  );
  if (!scenario) throw new Error(`unknown scenario: ${options.scenarioId}`);

  const target = parseTarget(options.target.url);
  await options.authorizeTarget(target);

  const timeoutMs = positiveBoundedInteger(
    options.target.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    300_000,
    "timeoutMs"
  );
  const maxResponseBytes = positiveBoundedInteger(
    options.target.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    10_000_000,
    "maxResponseBytes"
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const runId = options.runId ?? randomUUID();
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const startedMonotonic = performance.now();
  const request = HttpAgentRunRequest.parse({
    v: 1,
    runId,
    contractId: options.contract.contractId,
    contractRevision: options.contract.revision,
    scenarioId: scenario.id,
    input: scenario.input,
  });
  const combined = combineSignals(timeoutMs, options.signal);

  try {
    const response = await fetchImpl(target, {
      method: "POST",
      redirect: "error",
      headers: {
        ...options.target.headers,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: combined.signal,
    });

    if (!response.ok) {
      throw new Error(`assurance target returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("assurance target must return application/json");
    }

    const body = await readBoundedBody(response, maxResponseBytes);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error("assurance target returned invalid JSON");
    }
    const normalized = parseHttpAgentRunResponse(json);
    const finishedAt = now();
    const evidence = parseAgentRunEvidence({
      v: 1,
      runId,
      contractId: options.contract.contractId,
      contractRevision: options.contract.revision,
      scenarioId: scenario.id,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      status: normalized.status,
      output: normalized.output,
      durationMs: Math.max(0, Math.round(performance.now() - startedMonotonic)),
      totalCostMicros: normalized.totalCostMicros,
      toolEvents: normalized.toolEvents,
    });

    return { evidence, evaluation: evaluateRun(options.contract, evidence) };
  } finally {
    combined.dispose();
  }
}
