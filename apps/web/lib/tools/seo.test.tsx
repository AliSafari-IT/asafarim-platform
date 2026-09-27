import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import robots from "../../app/robots";
import { ToolShell } from "../../components/tools/ToolShell";
import { toolCatalogue } from "../../content/tools";
import { getIndexableTools } from "./catalogue";
import { buildToolMetadata, toolStructuredData } from "./metadata";
import { toolSitemapEntries } from "./sitemap";
import type { ToolDefinition, ToolLifecycle } from "./types";

const base = toolCatalogue.find((t) => t.slug === "notes-to-action-plan")!;
const as = (lifecycle: ToolLifecycle, extra: Partial<ToolDefinition> = {}): ToolDefinition => ({
  ...base,
  lifecycle,
  indexable: lifecycle === "beta" || lifecycle === "stable" || lifecycle === "paused",
  ...extra,
});

describe("tool metadata (#681)", () => {
  it("names the job, sets a bare canonical, and carries social cards", () => {
    const meta = buildToolMetadata(as("beta"));
    expect(meta.title).toBe("Turn messy notes into an action plan you can review");
    expect(meta.title).not.toMatch(/\bAI tool\b/i);
    expect(meta.alternates).toEqual({ canonical: "/tools/notes-to-action-plan" });
    expect(meta.openGraph).toMatchObject({ url: "/tools/notes-to-action-plan", title: meta.title, type: "website" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(meta.robots).toBeUndefined();
  });

  it("noindexes experiments and retired tools but keeps links followable", () => {
    for (const lifecycle of ["experiment", "retired"] as const) expect(buildToolMetadata(as(lifecycle)).robots).toEqual({ index: false, follow: true });
  });

  it("claims no translated alternates: tool pages are English-only", () => {
    const meta = buildToolMetadata(as("stable"));
    expect(meta.alternates).not.toHaveProperty("languages");
    expect(meta.openGraph).toMatchObject({ locale: "en" });
  });

  it("gives every catalogue tool a unique title and description", () => {
    const titles = toolCatalogue.map((t) => t.title);
    const descriptions = toolCatalogue.map((t) => t.shortDescription);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe("structured data", () => {
  const data = toolStructuredData(as("stable"), "https://asafarim.com");

  it("is a free WebApplication with only claims the page shows", () => {
    expect(data).toMatchObject({
      "@type": "WebApplication",
      name: base.title,
      url: "https://asafarim.com/tools/notes-to-action-plan",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0" },
      author: { name: "Ali Safari" },
      dateModified: base.lastReviewed,
    });
    for (const key of ["aggregateRating", "review", "reviews", "ratingValue", "downloadUrl", "interactionStatistic"]) expect(data).not.toHaveProperty(key);
  });

  it("is rendered only on indexable pages, escaped, and matches visible text", () => {
    const indexable = renderToStaticMarkup(<ToolShell tool={as("beta")}>{null}</ToolShell>);
    const experiment = renderToStaticMarkup(<ToolShell tool={as("experiment")}>{null}</ToolShell>);
    expect(indexable).toContain('<script type="application/ld+json">');
    expect(experiment).not.toContain("application/ld+json");
    const json = indexable.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1];
    expect(JSON.parse(json).name).toBe(base.title);
    const hostile = renderToStaticMarkup(<ToolShell tool={as("beta", { title: "x</script><script>alert(1)</script>" })}>{null}</ToolShell>);
    expect(hostile.match(/<script/g)).toHaveLength(1);
    // Every structured claim is visible on the page.
    for (const visible of ["Free to use", "No sign-in needed", "Ali Safari"]) expect(indexable).toContain(visible);
  });
});

describe("people-first page content", () => {
  const html = renderToStaticMarkup(<ToolShell tool={as("beta")}>{null}</ToolShell>);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("explains the job, inputs, outputs, a worked example, how it works, limitations, privacy, author, and review date", () => {
    for (const heading of ["What to paste", "What you get", "Worked example", "How it works", "Limitations"]) expect(text).toContain(heading);
    expect(text).toContain("Kick-off: moving the help centre");
    expect(text).toContain(base.howItWorks[0]);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/about"');
    expect(html).toContain(`dateTime="${base.lastReviewed}"`);
    expect(html).toMatch(/<article[^>]*lang="en"/);
  });
});

describe("sitemap and robots", () => {
  const origin = "https://asafarim.com";
  const urls = (tools: ToolDefinition[], listed = true) => toolSitemapEntries(origin, listed, tools).map((e) => e.url);

  it("lists stable, beta, and paused tools; never experiments, retired, or internal tools", () => {
    const tools = [
      as("stable", { slug: "requirements-to-test-plan" }),
      as("beta", { slug: "notes-to-action-plan" }),
      as("paused", { slug: "text-to-cited-timeline" }),
      as("experiment", { slug: "shell-reference" }),
      { ...as("retired"), slug: "shell-reference" as const },
      { ...as("beta"), slug: "shell-reference" as const, internal: true },
    ];
    expect(urls(tools)).toEqual([
      `${origin}/tools`,
      `${origin}/tools/requirements-to-test-plan`,
      `${origin}/tools/notes-to-action-plan`,
      `${origin}/tools/text-to-cited-timeline`,
    ]);
  });

  it("lists /tools only once it has a public tool, and never results, handoffs, or the API", () => {
    expect(urls([], false)).toEqual([]);
    expect(urls([as("beta")]).join(" ")).not.toMatch(/\/api\/|\/import|result|handoff|\?/);
  });

  it("uses the review date as lastModified", () => {
    expect(toolSitemapEntries(origin, true, [as("beta")])[1].lastModified).toEqual(new Date(`${base.lastReviewed}T00:00:00Z`));
  });

  it("the live catalogue has no indexable tools yet (all experimental)", () => {
    expect(getIndexableTools()).toEqual([]);
  });

  it("robots allows pages and disallows the tool API", () => {
    const rules = robots().rules;
    expect(rules).toMatchObject({ userAgent: "*", allow: "/", disallow: ["/api/"] });
  });
});

describe("portfolio links (#683)", () => {
  const showcaseData = require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../../../showcase/app/projects/ai-workbench/_data/workbench.ts"), "utf8") as string;

  it("every public tool links to its anchor on the canonical Showcase case study", () => {
    for (const tool of toolCatalogue.filter((t) => !t.internal)) {
      const match = tool.caseStudyPath?.match(/^\/projects\/ai-workbench#([a-z-]+)$/);
      expect(match, tool.slug).toBeTruthy();
      expect(showcaseData).toContain(`anchor: "${match![1]}"`);
      expect(showcaseData).toContain(`slug: "${tool.slug}"`);
    }
  });

  it("puts the author panel after the tool and its result, with distinct actions", () => {
    const html = renderToStaticMarkup(<ToolShell tool={as("beta")}>{<div id="workbench-marker" />}</ToolShell>);
    expect(html.indexOf("workbench-marker")).toBeLessThan(html.indexOf('aria-label="About the builder"'));
    for (const action of ["See how it was built", "Continue in TasksAI", "Discuss this kind of system"]) expect(html).toContain(action);
  });
});
