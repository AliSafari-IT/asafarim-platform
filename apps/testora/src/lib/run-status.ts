// Pure helpers shared by the server pages (aggregation) and the client badges
// (formatting). No JSX, no Date.now() — display strings are derived
// deterministically from the stored ISO timestamp to avoid SSR/CSR mismatches.

export type ResultStatus = "passed" | "failed" | "mixed";

/** One case's most-recent stored result. */
export interface LastResult {
  status: string;
  createdAt: string;
  targetBaseUrl: string | null;
}

/** A rolled-up result for a case, fixture or suite. */
export interface AggregateResult {
  status: ResultStatus;
  at: string;
  targetBaseUrl: string | null;
}

/** Roll up several cases' last results (used for fixtures and suites). */
export function aggregateResults(results: LastResult[]): AggregateResult | null {
  if (results.length === 0) return null;
  const failed = results.some((r) => r.status === "failed" || r.status === "error");
  const allPassed = results.every((r) => r.status === "passed");
  const latest = results.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a));
  return {
    status: failed ? "failed" : allPassed ? "passed" : "mixed",
    at: latest.createdAt,
    targetBaseUrl: latest.targetBaseUrl,
  };
}

/** Normalize a single case's last result into the shared shape. */
export function singleResult(result: LastResult | undefined): AggregateResult | null {
  if (!result) return null;
  const failed = result.status === "failed" || result.status === "error";
  return {
    status: failed ? "failed" : result.status === "passed" ? "passed" : "mixed",
    at: result.createdAt,
    targetBaseUrl: result.targetBaseUrl,
  };
}

/** Human label for a target origin: "Local" for localhost, else the bare host. */
export function domainLabel(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const host = new URL(baseUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) {
      return "Local";
    }
    return host;
  } catch {
    return null;
  }
}

export function isLocalDomain(baseUrl: string | null | undefined): boolean {
  return domainLabel(baseUrl) === "Local";
}

/** "2026-06-25T14:32:10.123Z" → "2026-06-25 14:32" (UTC, deterministic). */
export function formatStamp(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}
