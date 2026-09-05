import { describe, expect, it, vi } from "vitest";
import {
  type ClamAvConnection,
  createClamAvScanner,
  getScannerHealth,
} from "./scanner";

/**
 * A fake ClamAV daemon speaking the INSTREAM wire protocol, driven entirely
 * in memory. This is what lets the protocol framing (length-prefixed
 * chunks, the terminating zero-length chunk, response parsing) be exercised
 * without a real container — the fake plays a scripted server role against
 * the real client code in scanner.ts.
 */
function fakeConnection(
  behavior: (received: Buffer[], emit: (event: "data" | "close" | "error", arg?: unknown) => void) => void,
): { factory: () => ClamAvConnection; received: () => Buffer[] } {
  const received: Buffer[] = [];
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};

  const connection: ClamAvConnection = {
    connect: () => {
      queueMicrotask(() => fire("connect"));
    },
    write: (data: Buffer) => {
      received.push(data);
    },
    destroy: () => {},
    on: (event, listener) => {
      (listeners[event] ??= []).push(listener);
    },
  };

  function fire(event: string, arg?: unknown) {
    for (const listener of listeners[event] ?? []) listener(arg);
  }

  const emit = (event: "data" | "close" | "error", arg?: unknown) => fire(event, arg);

  return {
    factory: () => {
      queueMicrotask(() => behavior(received, emit));
      return connection;
    },
    received: () => received,
  };
}

function respondWith(text: string) {
  return (received: Buffer[], emit: (event: "data" | "close" | "error", arg?: unknown) => void) => {
    // Wait a tick so the client has finished writing its chunks first —
    // mirrors a real daemon, which only responds after the terminating
    // zero-length chunk arrives.
    queueMicrotask(() => {
      emit("data", Buffer.from(text, "utf8"));
      emit("close");
    });
  };
}

describe("ClamAV INSTREAM protocol", () => {
  it("reports clean on an OK response", async () => {
    const { factory } = fakeConnection(respondWith("stream: OK\0"));
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    const verdict = await scanner.scan(new Uint8Array([1, 2, 3]));
    expect(verdict).toEqual({ outcome: "clean", scannerName: "clamav:clamav:3310" });
  });

  it("reports infected with the signature on a FOUND response", async () => {
    const { factory } = fakeConnection(respondWith("stream: Eicar-Test-Signature FOUND\0"));
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(verdict).toEqual({
      outcome: "infected",
      scannerName: "clamav:clamav:3310",
      signature: "Eicar-Test-Signature",
    });
  });

  it("fails closed with detail 'malformed-response' on garbage the client cannot parse", async () => {
    const { factory } = fakeConnection(respondWith("INSTREAM: Unknown command\0"));
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(verdict).toEqual({
      outcome: "unavailable",
      scannerName: "clamav:clamav:3310",
      detail: "malformed-response",
    });
  });

  it("fails closed with detail 'malformed-response' on an empty response", async () => {
    const { factory } = fakeConnection((_received, emit) => {
      queueMicrotask(() => emit("close"));
    });
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(verdict).toEqual({
      outcome: "unavailable",
      scannerName: "clamav:clamav:3310",
      detail: "malformed-response",
    });
  });

  it("fails closed with detail 'size-limit-exceeded' when the daemon refuses the size", async () => {
    const { factory } = fakeConnection(respondWith("INSTREAM size limit exceeded. ERROR\0"));
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(verdict).toEqual({
      outcome: "unavailable",
      scannerName: "clamav:clamav:3310",
      detail: "size-limit-exceeded",
    });
  });

  it("fails closed with detail 'connection-error' when the socket errors", async () => {
    const { factory } = fakeConnection((_received, emit) => {
      queueMicrotask(() => emit("error", new Error("ECONNREFUSED")));
    });
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(verdict).toEqual({
      outcome: "unavailable",
      scannerName: "clamav:clamav:3310",
      detail: "connection-error",
    });
  });

  it("fails closed with detail 'timeout' when the daemon never responds", async () => {
    vi.useFakeTimers();
    try {
      const { factory } = fakeConnection(() => {
        // Never emits data or close — the daemon has hung.
      });
      const scanner = createClamAvScanner("clamav", 3310, { timeoutMs: 50, connectionFactory: factory });
      const pending = scanner.scan(new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(60);
      const verdict = await pending;
      expect(verdict).toEqual({
        outcome: "unavailable",
        scannerName: "clamav:clamav:3310",
        detail: "timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("frames the stream as length-prefixed chunks terminated by a zero-length chunk", async () => {
    const { factory, received } = fakeConnection(respondWith("stream: OK\0"));
    const scanner = createClamAvScanner("clamav", 3310, { connectionFactory: factory });
    await scanner.scan(new Uint8Array([9, 9, 9]));

    const sent = Buffer.concat(received());
    // "zINSTREAM\0" command, then a 4-byte big-endian length (3), the 3
    // bytes, then a 4-byte zero-length terminator.
    expect(sent.subarray(0, 10).toString("ascii")).toBe("zINSTREAM\0");
    expect(sent.readUInt32BE(10)).toBe(3);
    expect([...sent.subarray(14, 17)]).toEqual([9, 9, 9]);
    expect(sent.readUInt32BE(17)).toBe(0);
    expect(sent.length).toBe(21);
  });
});

describe("scanner health check", () => {
  it("reports not configured when no scanner URL is set", async () => {
    const health = await getScannerHealth({});
    expect(health).toEqual({ configured: false, reachable: false, scannerName: "none-configured" });
  });

  it("reports reachable on a PONG response", async () => {
    const { factory } = fakeConnection(respondWith("PONG\0"));
    const health = await getScannerHealth(
      { JOBMATCH_SCANNER_URL: "tcp://clamav:3310" },
      3_000,
      factory,
    );
    expect(health).toEqual({ configured: true, reachable: true, scannerName: "clamav:clamav:3310" });
  });

  it("reports unreachable when the daemon does not answer PING", async () => {
    const { factory } = fakeConnection((_received, emit) => {
      queueMicrotask(() => emit("close"));
    });
    const health = await getScannerHealth(
      { JOBMATCH_SCANNER_URL: "tcp://clamav:3310" },
      3_000,
      factory,
    );
    expect(health).toEqual({ configured: true, reachable: false, scannerName: "clamav:clamav:3310" });
  });

  it("reports the dev bypass as configured:false so it never looks like a real scanner", async () => {
    const health = await getScannerHealth({ JOBMATCH_SCANNER: "insecure-accept-all" });
    expect(health.configured).toBe(false);
    expect(health.reachable).toBe(true);
  });
});
