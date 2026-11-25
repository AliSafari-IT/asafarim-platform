import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedFetch, ResponseTooLargeError } from "./pinnedFetch";

/** The render tier's request client (#518): pinned address, streamed cap. */

let server: Server;
let port = 0;
let lastHost = "";
const pin = { address: "127.0.0.1", family: 4 as const };
const init = { method: "GET", headers: {}, body: null, timeoutMs: 5_000, maxBytes: 1_000 };

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHost = req.headers.host ?? "";
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-encoding": "gzip", "content-type": "text/plain" });
      return res.end(gzipSync("hello, decoded"));
    }
    if (req.url === "/bomb") {
      // Small on the wire, far over the cap once decoded.
      res.writeHead(200, { "content-encoding": "gzip" });
      return res.end(gzipSync(Buffer.alloc(100_000, 65)));
    }
    if (req.url === "/declared") {
      res.writeHead(200, { "content-length": "5000" });
      return res.end(Buffer.alloc(5000));
    }
    res.writeHead(302, { location: "/gzip", "set-cookie": ["a=1", "b=2"] });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe("pinnedFetch", () => {
  it("connects to the pinned address without resolving the host, and keeps the Host header", async () => {
    const res = await pinnedFetch(`http://does-not-resolve.invalid:${port}/gzip`, pin, init);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe("hello, decoded");
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(lastHost).toBe(`does-not-resolve.invalid:${port}`);
  });

  it("returns a redirect as is, for the caller to check", async () => {
    const res = await pinnedFetch(`http://x.invalid:${port}/redirect`, pin, init);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/gzip");
    expect(res.headers["set-cookie"]).toBe("a=1\nb=2");
  });

  it("refuses a body over the cap after decompression", async () => {
    await expect(pinnedFetch(`http://x.invalid:${port}/bomb`, pin, init)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("refuses a declared length over the cap before reading", async () => {
    await expect(pinnedFetch(`http://x.invalid:${port}/declared`, pin, init)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});
