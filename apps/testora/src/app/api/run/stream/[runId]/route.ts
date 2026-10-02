import { queueInfo, runStore, type QueueInfo } from "@/test-engine/executors/runLog";
import { isRunNotifierConnected, subscribeRunEvents } from "@/test-engine/executors/runEventsNotifier";

export const dynamic = "force-dynamic";

/** Poll interval when LISTEN/NOTIFY is down, and as a safety net when it's up. */
const POLL_MS = 2_000;
const POLL_MS_WITH_NOTIFY = 10_000;

/**
 * Live log for one run (#716): tails the run's append-only `run_events` rows,
 * woken by LISTEN/NOTIFY with a polling fallback. Holds no run state in
 * memory, so any process can serve any run's stream and a restart loses
 * nothing — the client reconnects and resumes after the last event it got.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const store = runStore();
  const run = await store.get(runId);
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  // EventSource reconnects automatically when the connection drops (common on
  // long runs) and sends back the id of the last event it received — the
  // event's seq. Resume after it, so lines are never replayed (replaying them
  // would double-count completed tests in the progress bar).
  const lastEventId = Number.parseInt(request.headers.get("Last-Event-ID") ?? "", 10);
  let cursor = Number.isNaN(lastEventId) ? 0 : lastEventId;

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: () => void = () => {};
  let poller: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        const idLine = id != null ? `id: ${id}\n` : "";
        try {
          controller.enqueue(encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          stop();
        }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (poller) clearTimeout(poller);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      let lastQueue: string | null = null;
      let pumping = false;
      let again = false;
      // Send every event after `cursor`; end the stream on done/error. While
      // queued, also report the (computed) place in line when it changes.
      const pump = async () => {
        if (closed) return;
        if (pumping) {
          again = true;
          return;
        }
        pumping = true;
        try {
          do {
            again = false;
            for (const event of await store.eventsAfter(runId, cursor)) {
              cursor = event.seq;
              if (event.kind === "log") send("log", event.payload, event.seq);
              else if (event.kind === "done" || event.kind === "error") {
                send(event.kind, event.payload, event.seq);
                stop();
                return;
              } else send(event.kind, event.payload, event.seq);
            }
            const current = await store.get(runId);
            if (current?.status === "queued") {
              const info = await queueInfo(runId);
              const key = info ? JSON.stringify(info) : null;
              if (info && key !== lastQueue) {
                lastQueue = key;
                send("queue", info satisfies QueueInfo);
              }
            }
            // Finished without a terminal event (e.g. pruned) — nothing more will come.
            if (current && !["created", "queued", "running"].includes(current.status) && !again) {
              const tail = await store.eventsAfter(runId, cursor);
              if (tail.length === 0) {
                send(current.status === "done" ? "done" : "error", current.status === "done" ? [] : (current.error ?? "Run ended"));
                stop();
                return;
              }
              again = true;
            }
          } while (again && !closed);
        } catch (error) {
          console.error(`[testora] stream ${runId} failed to read events:`, error);
        } finally {
          pumping = false;
        }
      };

      const schedulePoll = () => {
        if (closed) return;
        poller = setTimeout(async () => {
          await pump();
          schedulePoll();
        }, isRunNotifierConnected() ? POLL_MS_WITH_NOTIFY : POLL_MS);
      };

      unsubscribe = subscribeRunEvents(runId, () => void pump());
      request.signal.addEventListener("abort", stop);
      void pump();
      schedulePoll();
    },
    // The client disconnected.
    cancel() {
      closed = true;
      unsubscribe();
      if (poller) clearTimeout(poller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
