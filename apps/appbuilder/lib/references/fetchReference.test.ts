import { describe, expect, it } from "vitest";
import { fetchBoundedReference } from "./fetchReference";
import {
  ReferenceFetchFailedError,
  ReferenceRateLimitedError,
  ReferenceTimeoutError,
  ReferenceTooLargeError,
  ReferenceTooManyRedirectsError,
  ReferenceUrlNotAllowedError,
  UnsupportedReferenceContentTypeError,
} from "./errors";

/**
 * M13 slice F — the bounded fetcher. These tests are where the redirect,
 * rebinding, size, type, and rate-limit rules are actually pinned down: the
 * fetch and the DNS resolver are both injected, so a hostile redirect chain
 * or a lying Content-Length can be modelled exactly without network access.
 */

const PUBLIC = ["93.184.216.34"];

/** Resolves every name to a public address unless a per-host answer is given. */
function resolver(answers: Record<string, string[]> = {}) {
  const calls: string[] = [];
  const resolve = async (hostname: string) => {
    calls.push(hostname);
    return answers[hostname] ?? PUBLIC;
  };
  return { resolve, calls };
}

function html(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** A response whose body arrives in chunks and whose length is NOT declared — the case Content-Length checking alone would miss. */
function streamed(chunkCount: number, chunkSize: number, contentType = "text/html"): Response {
  const chunk = new Uint8Array(chunkSize).fill(97);
  let emitted = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= chunkCount) {
        controller.close();
        return;
      }
      emitted += 1;
      controller.enqueue(chunk);
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": contentType } });
}

/** Returns a fetch that answers each successive call from `responses`, recording the URLs it was called with. */
function fetchSequence(responses: Response[]) {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    inits.push(init);
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return next;
  }) as unknown as typeof fetch;
  return { fetchImpl, urls, inits };
}

describe("fetchBoundedReference — happy path", () => {
  it("returns the extracted body with its final URL and no redirect hops", async () => {
    const { fetchImpl, inits } = fetchSequence([html("<p>hello</p>")]);
    const result = await fetchBoundedReference("https://example.com/x", {}, { fetchImpl, resolveHost: resolver().resolve });

    expect(result.finalUrl).toBe("https://example.com/x");
    expect(result.contentType).toBe("text/html");
    expect(result.body.toString("utf8")).toContain("hello");
    expect(result.redirectCount).toBe(0);
    // Redirects are ours to follow, and no ambient credentials ever go out.
    expect(inits[0]?.redirect).toBe("manual");
    expect(inits[0]?.credentials).toBe("omit");
  });
});

describe("redirects", () => {
  it("follows a redirect and reports where it ended up", async () => {
    const { fetchImpl, urls } = fetchSequence([redirect("https://elsewhere.example.com/final"), html("<p>final</p>")]);
    const result = await fetchBoundedReference("https://example.com/start", {}, { fetchImpl, resolveHost: resolver().resolve });

    expect(urls).toEqual(["https://example.com/start", "https://elsewhere.example.com/final"]);
    expect(result.finalUrl).toBe("https://elsewhere.example.com/final");
    expect(result.redirectCount).toBe(1);
  });

  it("resolves a relative Location against the current hop", async () => {
    const { fetchImpl, urls } = fetchSequence([redirect("/moved"), html("<p>ok</p>")]);
    await fetchBoundedReference("https://example.com/a/b", {}, { fetchImpl, resolveHost: resolver().resolve });
    expect(urls[1]).toBe("https://example.com/moved");
  });

  it("stops once the redirect budget is spent", async () => {
    const { fetchImpl } = fetchSequence([
      redirect("https://example.com/1"),
      redirect("https://example.com/2"),
      redirect("https://example.com/3"),
      redirect("https://example.com/4"),
    ]);
    await expect(
      fetchBoundedReference("https://example.com/0", { maxRedirects: 3 }, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceTooManyRedirectsError);
  });

  it("re-applies the URL policy to the redirect target — a public URL cannot redirect to a private address", async () => {
    const { fetchImpl } = fetchSequence([redirect("https://169.254.169.254/latest/meta-data/")]);
    await expect(
      fetchBoundedReference("https://example.com/start", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceUrlNotAllowedError);
  });

  it("refuses a redirect that downgrades to http", async () => {
    const { fetchImpl } = fetchSequence([redirect("http://example.com/plain")]);
    await expect(
      fetchBoundedReference("https://example.com/start", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toMatchObject({ reason: "http" });
  });

  it("refuses a redirect to a non-standard port", async () => {
    const { fetchImpl } = fetchSequence([redirect("https://example.com:9200/_cluster/health")]);
    await expect(
      fetchBoundedReference("https://example.com/start", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toMatchObject({ reason: "non_standard_port" });
  });

  it("re-resolves DNS on the redirect hop, catching a rebinding answer the first hop did not have", async () => {
    const { fetchImpl } = fetchSequence([redirect("https://rebind.example.com/inner")]);
    const { resolve, calls } = resolver({ "rebind.example.com": ["93.184.216.34", "127.0.0.1"] });

    await expect(
      fetchBoundedReference("https://example.com/start", {}, { fetchImpl, resolveHost: resolve }),
    ).rejects.toBeInstanceOf(ReferenceUrlNotAllowedError);
    // Every hop is resolved, not just the first.
    expect(calls).toEqual(["example.com", "rebind.example.com"]);
  });

  it("treats a redirect with no Location as a failure rather than following nothing", async () => {
    const { fetchImpl } = fetchSequence([new Response(null, { status: 302 })]);
    await expect(
      fetchBoundedReference("https://example.com/start", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceFetchFailedError);
  });
});

describe("response size", () => {
  it("rejects a declared Content-Length over the cap before reading the body", async () => {
    const { fetchImpl } = fetchSequence([html("<p>small</p>", { "content-length": "9999999" })]);
    await expect(
      fetchBoundedReference("https://example.com/big", { maxBytes: 1024 }, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceTooLargeError);
  });

  it("rejects an oversize body that never declared its length, mid-stream", async () => {
    const { fetchImpl } = fetchSequence([streamed(10, 100)]);
    await expect(
      fetchBoundedReference("https://example.com/bomb", { maxBytes: 250 }, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceTooLargeError);
  });

  it("accepts a streamed body that stays inside the cap", async () => {
    const { fetchImpl } = fetchSequence([streamed(2, 100)]);
    const result = await fetchBoundedReference(
      "https://example.com/ok",
      { maxBytes: 250 },
      { fetchImpl, resolveHost: resolver().resolve },
    );
    expect(result.body.length).toBe(200);
  });
});

describe("content type", () => {
  it("rejects a type outside the allowlist", async () => {
    const { fetchImpl } = fetchSequence([
      new Response("binary", { status: 200, headers: { "content-type": "application/octet-stream" } }),
    ]);
    await expect(
      fetchBoundedReference("https://example.com/blob", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(UnsupportedReferenceContentTypeError);
  });

  it("rejects a response that declares no type at all", async () => {
    // Built from a stream so no Content-Type is inferred — a string body
    // would make the runtime add `text/plain` and the case would not be
    // tested at all.
    const bodyless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([109, 121]));
        controller.close();
      },
    });
    const { fetchImpl } = fetchSequence([new Response(bodyless, { status: 200 })]);
    await expect(
      fetchBoundedReference("https://example.com/mystery", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(UnsupportedReferenceContentTypeError);
  });

  it("honours a narrowed allowlist (as the GitHub adapter uses)", async () => {
    const { fetchImpl } = fetchSequence([html("<p>page</p>")]);
    await expect(
      fetchBoundedReference(
        "https://example.com/x",
        { allowedContentTypes: ["application/json"] },
        { fetchImpl, resolveHost: resolver().resolve },
      ),
    ).rejects.toBeInstanceOf(UnsupportedReferenceContentTypeError);
  });

  it("keeps the charset separately instead of failing on a parameterized type", async () => {
    const { fetchImpl } = fetchSequence([html("<p>x</p>", { "content-type": 'text/html; charset="ISO-8859-1"' })]);
    const result = await fetchBoundedReference("https://example.com/x", {}, { fetchImpl, resolveHost: resolver().resolve });
    expect(result.contentType).toBe("text/html");
    expect(result.charset).toBe("iso-8859-1");
  });
});

describe("upstream failures", () => {
  it("maps 404 and 5xx to a safe failure that never echoes the remote body", async () => {
    const notFound = fetchSequence([new Response("<h1>nope</h1>", { status: 404, headers: { "content-type": "text/html" } })]);
    await expect(
      fetchBoundedReference("https://example.com/gone", {}, { fetchImpl: notFound.fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining("not found") });

    const serverError = fetchSequence([new Response("stack trace here", { status: 500, headers: { "content-type": "text/plain" } })]);
    await expect(
      fetchBoundedReference("https://example.com/boom", {}, { fetchImpl: serverError.fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toMatchObject({ status: 500, message: expect.not.stringContaining("stack trace") });
  });

  it("reports a 429 as rate limiting, with the retry hint", async () => {
    const { fetchImpl } = fetchSequence([new Response(null, { status: 429, headers: { "retry-after": "120" } })]);
    await expect(
      fetchBoundedReference("https://api.example.com/x", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toMatchObject({ name: "ReferenceRateLimitedError", retryAfterSeconds: 120 });
  });

  it("recognizes GitHub's exhausted-quota 403 as rate limiting, not as a refusal", async () => {
    const { fetchImpl } = fetchSequence([
      new Response(null, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) },
      }),
    ]);
    const error = await fetchBoundedReference("https://api.github.com/users/x", {}, { fetchImpl, resolveHost: resolver().resolve }).catch(
      (err) => err,
    );
    expect(error).toBeInstanceOf(ReferenceRateLimitedError);
    expect(error.retryAfterSeconds).toBeGreaterThan(500);
  });

  it("still treats a plain 403 as a refusal", async () => {
    const { fetchImpl } = fetchSequence([new Response(null, { status: 403 })]);
    await expect(
      fetchBoundedReference("https://example.com/private", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceFetchFailedError);
  });

  it("turns a transport error into a safe message", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("connect ECONNREFUSED 93.184.216.34:443");
    }) as unknown as typeof fetch;
    await expect(
      fetchBoundedReference("https://example.com/x", {}, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toMatchObject({ message: expect.not.stringContaining("ECONNREFUSED") });
  });

  it("aborts on the whole-request timeout", async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;

    await expect(
      fetchBoundedReference("https://slow.example.com/x", { timeoutMs: 25 }, { fetchImpl, resolveHost: resolver().resolve }),
    ).rejects.toBeInstanceOf(ReferenceTimeoutError);
  });
});
