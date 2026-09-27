import { toolError, TOOL_ERROR_STATUS } from "../../../../../lib/tools/envelope";
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

// One store per server process — see idempotency.ts for why that's enough.
const store = createMemoryIdempotencyStore();

const headers = { "cache-control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
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
      signal: request.signal,
    });
    return Response.json(envelope, { status, headers });
  } catch {
    // Deliberately no error detail: it could carry user content.
    consoleToolLogger({ event: "tool_config", slug: slug.slice(0, 60), notes: ["unhandled execution error"] });
    return Response.json(toolError("internal"), { status: TOOL_ERROR_STATUS.internal, headers });
  }
}
