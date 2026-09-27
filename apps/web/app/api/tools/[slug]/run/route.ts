import { toolError, TOOL_ERROR_STATUS } from "../../../../../lib/tools/envelope";
import { clientKey, createAdmissionController, isSameOrigin, limitsFromEnv, readBodyLimited } from "../../../../../lib/tools/server/admission";
import { toolAdapters } from "../../../../../lib/tools/server/adapters";
import { loadRuntimeConfig } from "../../../../../lib/tools/server/config";
import { prismaCostEventSink } from "../../../../../lib/tools/server/cost-sink";
import { executeTool } from "../../../../../lib/tools/server/execute";
import { createMemoryIdempotencyStore } from "../../../../../lib/tools/server/idempotency";
import { consoleToolLogger } from "../../../../../lib/tools/server/log";
import { createAnthropicProvider } from "../../../../../lib/tools/server/providers/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard cap on the raw request body, checked before JSON parsing. */
const MAX_BODY_BYTES = 64_000;

// One store and one limiter per server process — see idempotency.ts and
// admission.ts for why that's enough (single replica).
const store = createMemoryIdempotencyStore();
const admission = createAdmissionController(limitsFromEnv(process.env));

const headers = { "cache-control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // CSRF: only same-origin, JSON requests. A cross-site form or fetch can't
  // spend another visitor's allowance. (JSON also forces a CORS preflight,
  // which this route never answers.)
  if (!isSameOrigin(request) || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json(toolError("invalid_request"), { status: 403, headers });
  }

  const client = clientKey(request.headers);
  const limited = admission.request(client);
  if (limited) {
    return Response.json(toolError("rate_limited", { retryAfterSeconds: limited.retryAfterSeconds }), {
      status: TOOL_ERROR_STATUS.rate_limited,
      headers: { ...headers, "retry-after": String(limited.retryAfterSeconds ?? 60) },
    });
  }

  const raw = await readBodyLimited(request, MAX_BODY_BYTES);
  if (raw === null) {
    return Response.json(toolError("input_too_large"), { status: TOOL_ERROR_STATUS.input_too_large, headers });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(toolError("invalid_request"), { status: TOOL_ERROR_STATUS.invalid_request, headers });
  }

  try {
    const { status, envelope } = await executeTool(slug, body, toolAdapters, {
      config: await loadRuntimeConfig(),
      createProvider: (provider, timeoutMs) => createAnthropicProvider(provider.apiKey, { timeoutMs }),
      store,
      sink: prismaCostEventSink,
      log: consoleToolLogger,
      admit: (toolSlug, worstCaseMicros) => admission.admitLive(client, toolSlug, worstCaseMicros),
      signal: request.signal,
    });
    const retryAfter = !envelope.ok ? envelope.error.retryAfterSeconds : undefined;
    return Response.json(envelope, { status, headers: retryAfter ? { ...headers, "retry-after": String(retryAfter) } : headers });
  } catch {
    // Deliberately no error detail: it could carry user content.
    consoleToolLogger({ event: "tool_config", slug: slug.slice(0, 60), notes: ["unhandled execution error"] });
    return Response.json(toolError("internal"), { status: TOOL_ERROR_STATUS.internal, headers });
  }
}
