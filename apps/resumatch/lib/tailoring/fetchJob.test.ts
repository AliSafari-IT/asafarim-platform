import { describe, expect, it, vi } from "vitest";
import { extractReadableText, fetchJobPosting, isPublicHttpsUrl } from "./fetchJob";

describe("outbound destination policy", () => {
  it("accepts a public HTTPS endpoint", () => {
    expect(isPublicHttpsUrl("https://jobs.example.test/posting/123")).toBe(true);
    expect(isPublicHttpsUrl("https://careers.example.co.uk/roles/1?ref=x")).toBe(true);
  });

  it("refuses plaintext HTTP", () => {
    expect(isPublicHttpsUrl("http://jobs.example.test/posting/123")).toBe(false);
  });

  it("refuses the cloud metadata service", () => {
    expect(isPublicHttpsUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isPublicHttpsUrl("https://metadata.google.internal/computeMetadata/v1/")).toBe(false);
  });

  it("refuses loopback and private ranges", () => {
    for (const url of [
      "https://localhost/jobs",
      "https://127.0.0.1/jobs",
      "https://10.0.0.5/jobs",
      "https://192.168.1.10/jobs",
      "https://172.16.0.1/jobs",
      "https://172.31.255.254/jobs",
      "https://[::1]/jobs",
      "https://100.64.0.1/jobs",
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });

  it("refuses internal-looking names", () => {
    expect(isPublicHttpsUrl("https://intranet/jobs")).toBe(false);
    expect(isPublicHttpsUrl("https://api.internal/jobs")).toBe(false);
    expect(isPublicHttpsUrl("https://feeds.localhost/jobs")).toBe(false);
  });

  it("refuses anything that is not a URL at all", () => {
    expect(isPublicHttpsUrl("")).toBe(false);
    expect(isPublicHttpsUrl("not a url")).toBe(false);
    expect(isPublicHttpsUrl("file:///etc/passwd")).toBe(false);
  });

  it("allows a public address in the 172 range outside the private block", () => {
    expect(isPublicHttpsUrl("https://172.15.0.1/jobs")).toBe(true);
    expect(isPublicHttpsUrl("https://172.32.0.1/jobs")).toBe(true);
  });
});

describe("extractReadableText", () => {
  it("strips scripts, styles, and tags while keeping visible text", () => {
    const html = `
      <html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body>
        <h1>Senior Backend Engineer</h1>
        <p>We are looking for someone with 5+ years of experience.</p>
        <p>Responsibilities include building APIs &amp; owning services.</p>
      </body></html>
    `;
    const text = extractReadableText(html);
    expect(text).toContain("Senior Backend Engineer");
    expect(text).toContain("building APIs & owning services");
    expect(text).not.toMatch(/alert\(1\)/);
    expect(text).not.toMatch(/color:red/);
  });

  it("caps extracted length so a hostile page cannot produce megabytes of text", () => {
    const html = `<body>${"word ".repeat(100_000)}</body>`;
    expect(extractReadableText(html).length).toBeLessThanOrEqual(200_000);
  });
});

describe("fetchJobPosting", () => {
  function htmlResponse(html: string, init: Partial<ResponseInit> = {}) {
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
      ...init,
    });
  }

  it("refuses a URL that is not public HTTPS without making a request", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchJobPosting("http://internal.example.test/jobs", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "URL_NOT_ALLOWED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("extracts rawText, title, and employer from a fetched page", async () => {
    const html = `
      <html><head>
        <title>Backend Engineer at Example Corp</title>
        <meta property="og:site_name" content="Example Corp" />
      </head><body>
        <h1>Backend Engineer</h1>
        <p>Build and own our core services.</p>
        <p>We are looking for a backend engineer with strong Node.js and PostgreSQL experience to join our growing platform team and help scale our infrastructure.</p>
      </body></html>
    `;
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(html));
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe("Backend Engineer at Example Corp");
      expect(result.employer).toBe("Example Corp");
      expect(result.rawText).toContain("Build and own our core services.");
    }
  });

  it("refuses a redirect rather than following it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://internal.example.test/" } }),
    );
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "REDIRECT_REFUSED" });
  });

  it("refuses an HTTP error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "HTTP_ERROR" });
  });

  it("refuses a response declared too large before reading the body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse("<html></html>", { headers: { "content-length": String(10 * 1024 * 1024) } }),
    );
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "RESPONSE_TOO_LARGE" });
  });

  it("treats a page with no readable text as a failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body></body></html>"));
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "NO_READABLE_TEXT" });
  });

  it("reports a network error without leaking the thrown error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom https://jobs.example.test/secret?key=abc"));
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "NETWORK_ERROR" });
  });

  it("reports a timeout when the request aborts", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "TIMEOUT" });
  });
});
