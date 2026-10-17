import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  extractJobPostingStructuredData,
} from "./jobPostingJsonLd";

function page(...blocks: string[]): string {
  return `<html><head>${blocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join("")}</head><body><p>Body</p></body></html>`;
}

describe("extractJobPostingStructuredData", () => {
  it("reads a plain JobPosting object", () => {
    const result = extractJobPostingStructuredData(
      page(
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Backend Engineer",
          hiringOrganization: { "@type": "Organization", name: "Example Corp" },
          description: "<p>Build services.</p>",
        })
      )
    );
    expect(result).toEqual({
      title: "Backend Engineer",
      employer: "Example Corp",
      descriptionHtml: "<p>Build services.</p>",
    });
  });

  it("finds a JobPosting inside a top-level array, a @graph and a mainEntity", () => {
    const posting = {
      "@type": "JobPosting",
      title: "Role",
      description: "Text",
    };
    for (const wrapped of [
      [{ "@type": "BreadcrumbList" }, posting],
      {
        "@context": "https://schema.org",
        "@graph": [{ "@type": "WebSite" }, posting],
      },
      { "@type": "WebPage", mainEntity: posting },
    ]) {
      expect(
        extractJobPostingStructuredData(page(JSON.stringify(wrapped)))?.title
      ).toBe("Role");
    }
  });

  it("accepts @type as an array and as a prefixed or full IRI", () => {
    for (const type of [
      ["JobPosting"],
      "schema:JobPosting",
      "https://schema.org/JobPosting",
    ]) {
      const result = extractJobPostingStructuredData(
        page(JSON.stringify({ "@type": type, title: "Role" }))
      );
      expect(result?.title, JSON.stringify(type)).toBe("Role");
    }
  });

  it("ignores structured data that is not a JobPosting", () => {
    const html = page(
      JSON.stringify({ "@type": "Organization", name: "Example Corp" }),
      JSON.stringify({ "@type": "JobPostingList", title: "Not it" })
    );
    expect(extractJobPostingStructuredData(html)).toBeNull();
  });

  it("skips a malformed block without throwing and still reads a later one", () => {
    const html = page(
      "{ not json",
      JSON.stringify({ "@type": "JobPosting", title: "Role" })
    );
    expect(() => extractJobPostingStructuredData(html)).not.toThrow();
    expect(extractJobPostingStructuredData(html)?.title).toBe("Role");
  });

  it("returns null for broken markup only", () => {
    for (const html of [
      page("{ not json"),
      page(""),
      page("null"),
      page("42"),
      page('"text"'),
    ]) {
      expect(extractJobPostingStructuredData(html)).toBeNull();
    }
  });

  it("tolerates literal line breaks inside a JSON string", () => {
    const html = page(
      '{"@type":"JobPosting","title":"Role","description":"line one\nline two"}'
    );
    expect(extractJobPostingStructuredData(html)?.descriptionHtml).toBe(
      "line one line two"
    );
  });

  it("skips a JobPosting with neither a title nor a description", () => {
    const html = page(
      JSON.stringify([
        { "@type": "JobPosting", hiringOrganization: "Empty Co" },
        {
          "@type": "JobPosting",
          title: "Real role",
          hiringOrganization: "Real Co",
        },
      ])
    );
    expect(extractJobPostingStructuredData(html)).toMatchObject({
      title: "Real role",
      employer: "Real Co",
    });
  });

  it("reads hiringOrganization as a string, an object or a list", () => {
    for (const [org, expected] of [
      ["Acme", "Acme"],
      [{ name: "Acme NV" }, "Acme NV"],
      [{ legalName: "Acme Legal NV" }, "Acme Legal NV"],
      [[{ "@type": "Organization" }, { name: "Second" }], "Second"],
      [{ "@type": "Organization" }, null],
    ] as const) {
      const result = extractJobPostingStructuredData(
        page(
          JSON.stringify({
            "@type": "JobPosting",
            title: "Role",
            hiringOrganization: org,
          })
        )
      );
      expect(result?.employer, JSON.stringify(org)).toBe(expected);
    }
  });

  it("falls back to name when title is missing, and cleans and caps the title", () => {
    const fromName = extractJobPostingStructuredData(
      page(JSON.stringify({ "@type": "JobPosting", name: "Named role" }))
    );
    expect(fromName?.title).toBe("Named role");

    const messy = extractJobPostingStructuredData(
      page(
        JSON.stringify({
          "@type": "JobPosting",
          title: "  <b>QA</b> &amp; Test &#8211; Lead  ",
        })
      )
    );
    expect(messy?.title).toBe("QA & Test – Lead");

    const long = extractJobPostingStructuredData(
      page(JSON.stringify({ "@type": "JobPosting", title: "x".repeat(1000) }))
    );
    expect(long?.title).toHaveLength(300);
  });

  it("handles single-quoted and unquoted type attributes and an HTML comment wrapper", () => {
    const body = JSON.stringify({ "@type": "JobPosting", title: "Role" });
    for (const html of [
      `<script type='application/ld+json'>${body}</script>`,
      `<script type=application/ld+json>${body}</script>`,
      `<SCRIPT data-x="1" TYPE="application/ld+json">${body}</SCRIPT>`,
      `<script type="application/ld+json"><!--${body}--></script>`,
    ]) {
      expect(extractJobPostingStructuredData(html)?.title, html).toBe("Role");
    }
  });

  it("keeps block offsets right after characters that lengthen when lowercased", () => {
    const html = `<title>İstanbul İzmir — Careers</title>${page(
      JSON.stringify({ "@type": "JobPosting", title: "Role" })
    )}`;
    expect(extractJobPostingStructuredData(html)?.title).toBe("Role");
  });

  it("does not read ordinary scripts", () => {
    const html = `<script>var x = ${JSON.stringify({ "@type": "JobPosting", title: "Role" })}</script>`;
    expect(extractJobPostingStructuredData(html)).toBeNull();
  });

  it("stays fast on a page full of unclosed ld+json openers", () => {
    const html =
      '<script type="application/ld+json">{"@type":"JobPosting",'.repeat(
        50_000
      ) + "x".repeat(1_000_000);
    const started = performance.now();
    expect(extractJobPostingStructuredData(html)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("reads at most 20 blocks", () => {
    const filler =
      '<script type="application/ld+json">{"@type":"WebSite"}</script>'.repeat(
        20
      );
    const posting = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Role",
    })}</script>`;
    expect(extractJobPostingStructuredData(filler + posting)).toBeNull();
    expect(
      extractJobPostingStructuredData(
        filler.slice(0, (-1 * filler.length) / 20) + posting
      )?.title
    ).toBe("Role");
  });

  it("stops walking a pathologically deep structure", () => {
    let nested: unknown = { "@type": "JobPosting", title: "Too deep" };
    for (let i = 0; i < 50; i++) nested = [nested];
    expect(
      extractJobPostingStructuredData(page(JSON.stringify(nested)))
    ).toBeNull();
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(
      decodeHtmlEntities(
        "a &amp; b &lt;p&gt; &quot;q&quot; &apos;s&#39; &#x2019; &#8211;"
      )
    ).toBe("a & b <p> \"q\" 's' ’ –");
  });

  it("leaves unknown or invalid entities alone", () => {
    expect(decodeHtmlEntities("&copy; &#0; &#xD800; &#99999999;")).toBe(
      "&copy; &#0; &#xD800; &#99999999;"
    );
  });
});
