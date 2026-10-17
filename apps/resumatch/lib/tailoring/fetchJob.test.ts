import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  extractReadableText,
  fetchJobPosting,
  isPublicHttpsUrl,
  MIN_USEFUL_CHARACTERS,
} from "./fetchJob";

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

  it.each([403, 429])("classifies a %i response as bot-blocked", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("blocked", { status }));
    const result = await fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
    expect(result).toEqual({ ok: false, reasonCode: "BOT_BLOCKED" });
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

describe("fetchJobPosting with JobPosting JSON-LD (#516)", () => {
  const fixture = (name: string) =>
    readFileSync(path.resolve(__dirname, "../../fixtures/job-postings", name), "utf8");

  async function fetchHtml(html: string) {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(html, { status: 200, headers: { "content-type": "text/html" } }));
    return fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
  }

  it("Greenhouse-style page: entity-escaped description replaces the page boilerplate", async () => {
    const result = await fetchHtml(fixture("greenhouse-style.html"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.title).toBe("Platform Engineer");
    // Not og:site_name ("Greenhouse"), which names the ATS rather than the employer.
    expect(result.employer).toBe("Northwind Labs");
    expect(result.rawText).toContain("Northwind Labs is hiring a Platform Engineer");
    expect(result.rawText).toContain("What you'll do");
    expect(result.rawText).toContain("Own Terraform modules for three AWS accounts");
    expect(result.rawText).not.toMatch(/&lt;|<p>|<li>/);
    for (const boilerplate of ["cookie", "Submit application", "Powered by Greenhouse", "Benefits"]) {
      expect(result.rawText).not.toContain(boilerplate);
    }
  });

  it("Lever-style page: array JSON-LD with a string employer and literal line breaks", async () => {
    const result = await fetchHtml(fixture("lever-style.html"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.title).toBe("Senior Data Analyst");
    expect(result.employer).toBe("Contoso Health");
    expect(result.rawText).toContain("About the role");
    expect(result.rawText).toContain("3+ years in healthcare or insurance analytics");
    expect(result.rawText).not.toContain("Jobs powered by Lever");
    expect(result.rawText).not.toContain("Apply for this job");
  });

  it("Workday-style page: a JS shell whose only posting text is in @graph JSON-LD", async () => {
    const html = fixture("workday-style.html");
    // Without the structured data this page has no readable text at all.
    expect(extractReadableText(html).length).toBeLessThan(MIN_USEFUL_CHARACTERS);

    const result = await fetchHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.title).toBe("QA Automation Engineer \u2013 Payments");
    expect(result.employer).toBe("Fabrikam N.V.");
    expect(result.rawText).toContain("Playwright end-to-end tests");
    expect(result.rawText).not.toContain("Loading");
  });

  it("a page without JobPosting markup gives exactly today's result", async () => {
    const html = `
      <html><head>
        <title>Backend Engineer at Example Corp</title>
        <meta property="og:site_name" content="Example Corp" />
        <script type="application/ld+json">{"@type":"Organization","name":"Other Org"}</script>
      </head><body>
        <h1>Backend Engineer</h1>
        <p>We are looking for a backend engineer with strong Node.js and PostgreSQL experience to join our growing platform team and help scale our infrastructure.</p>
      </body></html>
    `;
    expect(await fetchHtml(html)).toEqual({
      ok: true,
      rawText: extractReadableText(html),
      title: "Backend Engineer at Example Corp",
      employer: "Example Corp",
    });
  });

  it("malformed JSON-LD falls through to the existing heuristics", async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Backend Engineer" />
        <meta property="og:site_name" content="Example Corp" />
        <script type="application/ld+json">{ "@type": "JobPosting", "title": "Broken", </script>
      </head><body>
        <p>We are looking for a backend engineer with strong Node.js and PostgreSQL experience to join our growing platform team and help scale our infrastructure.</p>
      </body></html>
    `;
    expect(await fetchHtml(html)).toEqual({
      ok: true,
      rawText: extractReadableText(html),
      title: "Backend Engineer",
      employer: "Example Corp",
    });
  });

  it("a thin JSON-LD description falls back to the page text, keeping the structured title and employer", async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Careers" />
        <script type="application/ld+json">${JSON.stringify({
          "@type": "JobPosting",
          title: "Backend Engineer",
          hiringOrganization: { name: "Example Corp" },
          description: "See below.",
        })}</script>
      </head><body>
        <p>We are looking for a backend engineer with strong Node.js and PostgreSQL experience to join our growing platform team and help scale our infrastructure.</p>
      </body></html>
    `;
    const result = await fetchHtml(html);
    expect(result).toEqual({
      ok: true,
      rawText: extractReadableText(html),
      title: "Backend Engineer",
      employer: "Example Corp",
    });
  });

  it("a JSON-LD title without an employer keeps the og:site_name employer", async () => {
    const html = `
      <html><head>
        <meta property="og:site_name" content="Example Corp" />
        <script type="application/ld+json">{"@type":"JobPosting","title":"Backend Engineer"}</script>
      </head><body>
        <p>We are looking for a backend engineer with strong Node.js and PostgreSQL experience to join our growing platform team and help scale our infrastructure.</p>
      </body></html>
    `;
    const result = await fetchHtml(html);
    expect(result.ok && result.employer).toBe("Example Corp");
    expect(result.ok && result.title).toBe("Backend Engineer");
  });

  it("caps a huge JSON-LD description at the extraction limit", async () => {
    const description = "Responsible engineer. ".repeat(20_000);
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Role",
      description,
    })}</script>`;
    const result = await fetchHtml(html);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rawText.length).toBeLessThanOrEqual(200_000);
  });

  it("still refuses a page where neither the JSON-LD nor the page has enough text", async () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Role","description":"Short."}</script>`;
    expect(await fetchHtml(html)).toEqual({ ok: false, reasonCode: "NO_READABLE_TEXT" });
  });
});
