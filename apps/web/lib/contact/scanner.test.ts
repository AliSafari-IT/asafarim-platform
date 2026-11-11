import { describe, expect, it } from "vitest";
import {
  createClamScanner,
  createScanner,
  type ClamConnection,
} from "./scanner";

/** A fake clamd: replies with `reply` once the stream ends, or misbehaves as told. */
function fake(
  reply: string | "error" | "silent"
): (h: string, p: number) => ClamConnection {
  return () => {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    return {
      connect: () => {
        queueMicrotask(() => {
          if (reply === "error") return handlers.error?.(new Error("refused"));
          handlers.connect?.();
          if (reply !== "silent") {
            handlers.data?.(Buffer.from(reply));
            handlers.close?.();
          }
        });
      },
      write: () => undefined,
      destroy: () => undefined,
      on: (event, listener) => void (handlers[event] = listener),
    };
  };
}

const scan = (reply: Parameters<typeof fake>[0], timeoutMs = 200) =>
  createClamScanner("clamav", 3310, {
    connectionFactory: fake(reply),
    timeoutMs,
  }).scan(Buffer.from("x"));

describe("ClamAV scanner", () => {
  it("clean", async () =>
    expect((await scan("stream: OK\0")).outcome).toBe("clean"));
  it("infected, with the signature", async () =>
    expect(
      await scan("stream: Pdf.Exploit.CVE_2010-0188-1 FOUND\0")
    ).toMatchObject({
      outcome: "infected",
      signature: "Pdf.Exploit.CVE_2010-0188-1",
    }));
  it("fails closed: refused connection, silence, garbage, size limit", async () => {
    expect(await scan("error")).toMatchObject({
      outcome: "unavailable",
      detail: "connection-error",
    });
    expect(await scan("silent")).toMatchObject({
      outcome: "unavailable",
      detail: "timeout",
    });
    expect(await scan("what?")).toMatchObject({
      outcome: "unavailable",
      detail: "malformed-response",
    });
    expect(await scan("INSTREAM size limit exceeded. ERROR")).toMatchObject({
      detail: "size-limit-exceeded",
    });
  });
});

describe("createScanner", () => {
  it("no scanner configured means unavailable, never clean", async () => {
    expect((await createScanner({}).scan(Buffer.from("x"))).outcome).toBe(
      "unavailable"
    );
    expect(
      (
        await createScanner({ CONTACT_SCANNER_URL: "not a url" }).scan(
          Buffer.from("x")
        )
      ).outcome
    ).toBe("unavailable");
  });
  it("the dev bypass works only outside production", async () => {
    const dev = { CONTACT_SCANNER: "insecure-accept-all" };
    expect(
      (
        await createScanner({ ...dev, NODE_ENV: "development" }).scan(
          Buffer.from("x")
        )
      ).outcome
    ).toBe("clean");
    expect(
      (
        await createScanner({ ...dev, NODE_ENV: "production" }).scan(
          Buffer.from("x")
        )
      ).outcome
    ).toBe("unavailable");
  });
});
