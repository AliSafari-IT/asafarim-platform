import { getRun } from "@/test-engine/executors/runLog";

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

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        const idLine = id != null ? `id: ${id}\n` : "";
        controller.enqueue(
          encoder.encode(
            `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      if (run.totalRuns != null && run.label != null) {
        send("meta", { totalRuns: run.totalRuns, label: run.label });
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
        controller.close();
        return;
      }

      const onLog = () => flush();
      const onMeta = (meta: { totalRuns: number; label: string }) =>
        send("meta", meta);
      const onDone = (result: unknown) => {
        flush();
        send("done", result);
        cleanup();
        controller.close();
      };
      const onError = (error: string) => {
        flush();
        send("error", error);
        cleanup();
        controller.close();
      };
      function cleanup() {
        run!.emitter.off("log", onLog);
        run!.emitter.off("meta", onMeta);
        run!.emitter.off("done", onDone);
        run!.emitter.off("error", onError);
      }

      // Subscribe before the initial flush so a line appended in between still
      // gets delivered (the listener flushes from the shared cursor).
      run.emitter.on("log", onLog);
      run.emitter.on("meta", onMeta);
      run.emitter.on("done", onDone);
      run.emitter.on("error", onError);

      flush();
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
