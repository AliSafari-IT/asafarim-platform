import "server-only";
import type { RequestContext } from "../context";

/**
 * SSE-first realtime (docs/adr: M04). The web process does not hold a
 * Redis subscription; instead each stream polls `ActivityEvent` for the
 * workspace since a cursor and emits new rows. This keeps the web tier
 * stateless and horizontally scalable; the trade-off is up to `INTERVAL_MS`
 * of latency, which is acceptable for a task tool and revisited under load
 * in M11.
 *
 * Stale-write resolution is not here — it is the `409 conflict_version`
 * path in the API (lib/api/http.ts `assertVersion`). The stream only tells
 * a client "something changed, re-fetch".
 */
const INTERVAL_MS = 3000;
const MAX_BATCH = 200;

export function activityStream(ctx: RequestContext, sinceIso: string | null): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor = sinceIso ? new Date(sinceIso) : new Date();
  let closed = false;

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));
      const tick = async () => {
        if (closed) return;
        try {
          const rows = await ctx.db.activityEvent.findMany({
            where: { workspaceId: ctx.workspaceId, occurredAt: { gt: cursor } },
            orderBy: { occurredAt: "asc" },
            take: MAX_BATCH,
            select: { id: true, name: true, targetType: true, targetId: true, occurredAt: true },
          });
          if (rows.length) {
            cursor = rows[rows.length - 1].occurredAt;
            for (const r of rows) {
              controller.enqueue(
                encoder.encode(`event: activity\ndata: ${JSON.stringify(r)}\n\n`),
              );
            }
          } else {
            controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
          }
        } catch {
          controller.enqueue(encoder.encode(`event: error\ndata: {"retry":true}\n\n`));
        }
        if (!closed) setTimeout(tick, INTERVAL_MS);
      };
      void tick();
    },
    cancel() {
      closed = true;
    },
  });
}
