import { z } from "zod";
import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ApiError, fromPrismaError } from "../../../../../../../../lib/errors";
import { AiJobCancelledError, runAiJob } from "../../../../../../../../lib/ai/job";
import type { ProviderDelta } from "../../../../../../../../lib/ai/provider";

export const dynamic = "force-dynamic";

/** Same normalization `lib/api/http.ts#fail()` applies to a JSON error
 *  response, reused here for the SSE `error` event's data payload so a
 *  streamed failure looks like any other API error to the client. */
function errorBody(err: unknown) {
  const apiErr =
    err instanceof ApiError
      ? err
      : (fromPrismaError(err) ??
        (err instanceof z.ZodError ? new ApiError("validation_failed", err.flatten()) : new ApiError("internal")));
  return apiErr.toBody();
}

/**
 * Streaming counterpart to `POST .../ai/jobs` (issue #236). Same input
 * `{ kind, input, projectId?, taskId? }`, same underlying `runAiJob` — the
 * one persistence path (guard + AiJob + usage ledger + Proposal) runs
 * exactly once, server-side, on completion, whichever route was used.
 *
 * SSE events: zero or more `token` (raw text as it arrives) and
 * `operation` (one parsed operation + its index) deltas, then exactly one
 * terminal `proposal` (the same body `POST .../ai/jobs` returns) or `error`
 * event. A client that stops listening (Stop button, or a dropped
 * connection) fires this stream's `cancel()`, which aborts the in-flight
 * provider call and leaves no Proposal — see AiJobCancelledError in
 * lib/ai/job.ts. Reuses the M04 SSE convention (headers, `: comment`
 * keep-alive framing) from app/api/v1/workspaces/[slug]/stream/route.ts;
 * unlike that endpoint this stream is one-shot, not a resumable
 * subscription, so there is no `since`/reconnect cursor.
 */
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  const encoder = new TextEncoder();
  // Own AbortController rather than trusting `req.signal` to reflect a
  // disconnect that happens *during* the streamed response — the M04
  // pattern's `cancel()` callback is the reliable disconnect signal in this
  // runtime (see activityStream in lib/realtime/stream.ts), so that is what
  // drives cancellation here too.
  const abort = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send("connected", {});

      const onDelta = (delta: ProviderDelta) => send(delta.type, delta);
      try {
        const result = await runAiJob(ctx, body, { onDelta, signal: abort.signal });
        send("proposal", result);
      } catch (err) {
        if (err instanceof AiJobCancelledError) {
          // The client already stopped listening — nothing to send, and
          // nothing beyond the AiJob's own `cancelled` row was persisted.
        } else {
          send("error", errorBody(err));
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by a concurrent cancel() — nothing left to do.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});
