import {
  INDEXABLE_LIFECYCLES,
  TOOL_CAPABILITIES,
  TOOL_CATEGORIES,
  TOOL_LIFECYCLES,
  TOOL_SLUGS,
  type ToolDefinition,
} from "./types";

/**
 * Catalogue validation. `lib/tools/catalogue.ts` runs this at module load, so
 * an invalid entry fails `next build` (and every test that imports the
 * catalogue) instead of shipping a tool page with missing disclosures.
 *
 * Returns human-readable problems; an empty array means the catalogue is valid.
 */
export function validateCatalogue(
  tools: readonly ToolDefinition[],
  options: { today?: string; knownSlugs?: readonly string[] } = {}
): string[] {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const knownSlugs = options.knownSlugs ?? TOOL_SLUGS;
  const problems: string[] = [];
  const seen = new Set<string>();
  const featured = new Map<number, string>();

  for (const tool of tools) {
    const at = `tool "${tool.slug}"`;
    const fail = (message: string) => problems.push(`${at}: ${message}`);

    if (seen.has(tool.slug)) fail("duplicate slug");
    seen.add(tool.slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tool.slug)) fail("slug must be lowercase kebab-case");
    if (!knownSlugs.includes(tool.slug)) fail("slug is not listed in TOOL_SLUGS");

    for (const key of ["title", "shortDescription", "longDescription", "inputSummary", "outputSummary"] as const) {
      if (!tool[key]?.trim()) fail(`missing ${key}`);
    }
    if (!TOOL_CATEGORIES.includes(tool.category)) fail(`unknown category "${tool.category}"`);
    for (const capability of tool.capabilities) {
      if (!TOOL_CAPABILITIES.includes(capability)) fail(`unknown capability "${capability}"`);
    }

    // Lifecycle and indexability (charter §4).
    if (!TOOL_LIFECYCLES.includes(tool.lifecycle)) {
      fail(`unknown lifecycle "${tool.lifecycle}"`);
    } else {
      const shouldIndex = INDEXABLE_LIFECYCLES.includes(tool.lifecycle);
      if (tool.indexable !== shouldIndex) {
        fail(`lifecycle "${tool.lifecycle}" must have indexable: ${shouldIndex}`);
      }
    }
    if (tool.internal && (tool.lifecycle !== "experiment" || tool.indexable)) {
      fail("internal tools must be experiment and not indexable");
    }
    if (tool.internal && tool.featuredOrder !== undefined) fail("internal tools cannot be featured");
    if (tool.lifecycle === "stable" && !tool.caseStudyPath) {
      fail("stable tools require a published case study (charter §4.1)");
    }

    // Required disclosures.
    if (!tool.privacyStatement?.trim()) fail("missing privacyStatement");
    if (!tool.limitations?.length || tool.limitations.some((l) => !l.trim())) {
      fail("at least one non-empty limitation is required");
    }

    // Limits and fixture.
    const { minInputChars, maxInputChars } = tool.limits ?? {};
    if (!(Number.isInteger(minInputChars) && Number.isInteger(maxInputChars) && minInputChars > 0 && maxInputChars > minInputChars)) {
      fail("limits need integer minInputChars > 0 and maxInputChars > minInputChars");
    }
    if (!tool.example?.label?.trim()) fail("example needs a label");
    const exampleLength = tool.example?.input?.trim().length ?? 0;
    if (!exampleLength) {
      fail("missing example fixture input");
    } else if (exampleLength < minInputChars || exampleLength > maxInputChars) {
      fail("example input must satisfy the tool's own input limits");
    }
    if (tool.example?.output === undefined || tool.example.output === null) fail("missing example fixture output");

    // Links, dates, ordering.
    if (tool.caseStudyPath !== undefined && !tool.caseStudyPath.startsWith("/")) {
      fail("caseStudyPath must be a path on the Showcase origin, starting with /");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tool.lastReviewed) || Number.isNaN(Date.parse(tool.lastReviewed))) {
      fail("lastReviewed must be an ISO date (YYYY-MM-DD)");
    } else if (tool.lastReviewed > today) {
      fail("lastReviewed cannot be in the future");
    }
    if (tool.featuredOrder !== undefined) {
      const clash = featured.get(tool.featuredOrder);
      if (clash) fail(`featuredOrder ${tool.featuredOrder} is also used by "${clash}"`);
      featured.set(tool.featuredOrder, tool.slug);
    }

    // Serializability: catches functions, components, class instances, etc.
    if (!isPlainData(tool)) fail("entry must be plain JSON-serializable data (no functions or components)");
  }

  for (const slug of knownSlugs) {
    if (!seen.has(slug)) problems.push(`slug "${slug}" is in TOOL_SLUGS but has no catalogue entry`);
  }

  return problems;
}

function isPlainData(value: unknown): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "undefined":
      return true; // optional fields
    case "object": {
      if (Array.isArray(value)) return value.every(isPlainData);
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return false;
      return Object.values(value as Record<string, unknown>).every(isPlainData);
    }
    default:
      return false;
  }
}
