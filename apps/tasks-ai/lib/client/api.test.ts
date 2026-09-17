import { describe, expect, it } from "vitest";
import { readEventStream } from "./api";

/** Builds a ReadableStream<Uint8Array> from a list of raw text chunks —
 *  simulating how a real network response arrives in arbitrary pieces,
 *  possibly splitting an SSE frame across chunk boundaries. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
}

describe("readEventStream (issue #236)", () => {
  it("parses event/data frames separated by a blank line", async () => {
    const events: { event: string; data: string }[] = [];
    await readEventStream(
      streamOf(['event: token\ndata: {"text":"hi"}\n\n', 'event: proposal\ndata: {"ok":true}\n\n']),
      (event, data) => events.push({ event, data }),
    );
    expect(events).toEqual([
      { event: "token", data: '{"text":"hi"}' },
      { event: "proposal", data: '{"ok":true}' },
    ]);
  });

  it("reassembles a frame split across multiple chunks", async () => {
    const events: { event: string; data: string }[] = [];
    await readEventStream(
      streamOf(["event: tok", "en\ndata: {\"tex", 't":"hi"}\n\n']),
      (event, data) => events.push({ event, data }),
    );
    expect(events).toEqual([{ event: "token", data: '{"text":"hi"}' }]);
  });

  it("ignores `: comment` keep-alive frames", async () => {
    const events: { event: string; data: string }[] = [];
    await readEventStream(
      streamOf([": connected\n\n", "event: proposal\ndata: {}\n\n"]),
      (event, data) => events.push({ event, data }),
    );
    expect(events).toEqual([{ event: "proposal", data: "{}" }]);
  });

  it("joins a multi-line data field with newlines", async () => {
    const events: { event: string; data: string }[] = [];
    await readEventStream(streamOf(["event: token\ndata: line1\ndata: line2\n\n"]), (event, data) =>
      events.push({ event, data }),
    );
    expect(events).toEqual([{ event: "token", data: "line1\nline2" }]);
  });

  it("defaults the event name to \"message\" when none is given", async () => {
    const events: { event: string; data: string }[] = [];
    await readEventStream(streamOf(["data: hi\n\n"]), (event, data) => events.push({ event, data }));
    expect(events).toEqual([{ event: "message", data: "hi" }]);
  });
});
