import { getRun, queueInfo, type QueueInfo } from "@/test-engine/executors/runLog";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  // EventSource reconnects automatically when the connection drops (common on
  // long runs). On reconnect the browser sends back the id of the last log line
  // it received; resume from there so we never replay lines the client already
  // has — replaying them would double-count completed tests in the progress bar.
  const lastEventId = Number.parseInt(
    request.headers.get("Last-Event-ID") ?? "",
    10,
  );
  const resumeFrom = Number.isNaN(lastEventId) ? -1 : lastEventId;

  const encoder = new TextEncoder();

  // Detaches this client's listeners from the run. Must run however the
  // stream ends — including when the browser disconnects (tab closed,
  // navigation, EventSource reconnect). A stale listener would otherwise
  // write to a closed stream and THROW inside run.emitter.emit(), i.e. inside
  // the run's own log writer or the cancel request, breaking the run.
  let detach: () => void = () => {};
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        const idLine = id != null ? `id: ${id}\n` : "";
        try {
          controller.enqueue(
            encoder.encode(
              `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // The client went away between checks — stop sending, never throw
          // back into the emitter.
          closed = true;
          detach();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (run.totalRuns != null && run.label != null) {
        send("meta", { totalRuns: run.totalRuns, label: run.label });
      }
      // A queued run learns where it stands right away (and on every change
      // via the "queue" listener below); "started" fires when a runner frees up.
      if (run.status === "queued") {
        const info = queueInfo(runId);
        if (info) send("queue", info);
      }

      // Each log line's id is its index in the buffer. `cursor` is the next index
      // we still owe the client; flushing is idempotent so live emissions and the
      // initial backlog can't duplicate or skip lines.
      let cursor = resumeFrom + 1;
      const flush = () => {
        for (; cursor < run.lines.length; cursor++) {
          send("log", run.lines[cursor], cursor);
        }
      };

      if (run.done) {
        flush();
        send(run.error ? "error" : "done", run.error ?? run.result);
        close();
        return;
      }

      const onLog = () => flush();
      const onMeta = (meta: { totalRuns: number; label: string }) =>
        send("meta", meta);
      const onQueue = (info: QueueInfo) => send("queue", info);
      const onStarted = (info: { waitedMs: number }) => send("started", info);
      const onDone = (result: unknown) => {
        flush();
        send("done", result);
        cleanup();
        close();
      };
      const onError = (error: string) => {
        flush();
        send("error", error);
        cleanup();
        close();
      };
      function cleanup() {
        run!.emitter.off("log", onLog);
        run!.emitter.off("meta", onMeta);
        run!.emitter.off("queue", onQueue);
        run!.emitter.off("started", onStarted);
        run!.emitter.off("done", onDone);
        run!.emitter.off("error", onError);
      }

      // Subscribe before the initial flush so a line appended in between still
      // gets delivered (the listener flushes from the shared cursor).
      run.emitter.on("log", onLog);
      run.emitter.on("meta", onMeta);
      run.emitter.on("queue", onQueue);
      run.emitter.on("started", onStarted);
      run.emitter.on("done", onDone);
      run.emitter.on("error", onError);
      detach = cleanup;
      request.signal.addEventListener("abort", () => {
        closed = true;
        cleanup();
      });

      flush();
    },
    // The client disconnected.
    cancel() {
      closed = true;
      detach();
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
