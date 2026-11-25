import "server-only";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * One HTTP request for the render tier (#518), sent to an address that was
 * already checked. The host name is never resolved again: the socket goes
 * to `address` (so a DNS-rebinding answer cannot swap in a private address
 * between the check and the connection), while TLS still verifies the
 * certificate for the host name in the URL.
 *
 * The body is streamed and cut off at `maxBytes`, after decompression, so
 * a page cannot make the server buffer an oversized response. Redirects are
 * not followed here; the caller checks each hop.
 */

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

export interface PinnedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export class ResponseTooLargeError extends Error {
  constructor() {
    super("response over the size cap");
    this.name = "ResponseTooLargeError";
  }
}

/** Request headers that describe this hop's connection, not the request. */
const DROPPED_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding", "keep-alive", "transfer-encoding", "upgrade"]);
/** Response headers that no longer describe the decoded body we hand over. */
const DROPPED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

function pinnedLookup(pin: PinnedAddress): LookupFunction {
  return ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) callback(null, [{ address: pin.address, family: pin.family }]);
    else callback(null, pin.address, pin.family);
  }) as unknown as LookupFunction;
}

function decoded(response: IncomingMessage): NodeJS.ReadableStream {
  switch ((response.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return response.pipe(createGunzip());
    case "deflate":
      return response.pipe(createInflate());
    case "br":
      return response.pipe(createBrotliDecompress());
    default:
      return response;
  }
}

export function pinnedFetch(
  url: string,
  pin: PinnedAddress,
  init: { method: string; headers: Record<string, string>; body: Buffer | null; timeoutMs: number; maxBytes: number },
): Promise<PinnedResponse> {
  const target = new URL(url);
  const send = target.protocol === "https:" ? httpsRequest : target.protocol === "http:" ? httpRequest : null;
  if (!send) return Promise.reject(new Error("unsupported protocol"));

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(init.headers)) {
    const key = name.toLowerCase();
    if (key.startsWith(":") || DROPPED_REQUEST_HEADERS.has(key)) continue;
    headers[key] = value;
  }
  headers["accept-encoding"] = "gzip, deflate, br";

  return new Promise<PinnedResponse>((resolve, reject) => {
    const req = send(
      target,
      { method: init.method, headers, lookup: pinnedLookup(pin), signal: AbortSignal.timeout(init.timeoutMs), agent: false },
      (response) => {
        const declared = Number(response.headers["content-length"]);
        if (Number.isFinite(declared) && declared > init.maxBytes) {
          response.destroy();
          reject(new ResponseTooLargeError());
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const stream = decoded(response);
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > init.maxBytes) {
            response.destroy();
            (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
            reject(new ResponseTooLargeError());
            return;
          }
          chunks.push(chunk);
        });
        stream.on("error", reject);
        stream.on("end", () => {
          const out: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (value === undefined || DROPPED_RESPONSE_HEADERS.has(name)) continue;
            out[name] = Array.isArray(value) ? value.join("\n") : value;
          }
          resolve({ status: response.statusCode ?? 502, headers: out, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
