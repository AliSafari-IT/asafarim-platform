import type { Metadata } from "next";
import type { ToolCategory, ToolDefinition } from "./types";

/**
 * Page metadata derived from the catalogue entry, so titles and
 * descriptions are never restated in page files (#681).
 *
 * - Canonical is always the bare path: query strings and locale cookies
 *   never create a second indexable URL.
 * - Only beta/stable/paused tools are indexable; experiments and retired
 *   tools are `noindex, follow` and stay out of the sitemap.
 * - No `alternates.languages`: tool pages exist in English only (see
 *   docs/ai-tools/seo.md), so there are no equivalent translated pages to
 *   point to.
 * - Social images come from `app/tools/[slug]/opengraph-image.tsx`.
 */
export function buildToolMetadata(tool: ToolDefinition): Metadata {
  const url = `/tools/${tool.slug}`;
  return {
    title: tool.title,
    description: tool.shortDescription,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: tool.title, description: tool.shortDescription, siteName: "ASafarIM Digital", locale: "en" },
    twitter: { card: "summary_large_image", title: tool.title, description: tool.shortDescription },
    ...(tool.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

const APPLICATION_CATEGORY: Record<ToolCategory, string> = {
  testing: "DeveloperApplication",
  planning: "BusinessApplication",
  research: "ReferenceApplication",
  reference: "DeveloperApplication",
};

/**
 * schema.org WebApplication for an indexable tool page. Every property is
 * visible on the page: the name and description, "Free to use · No sign-in
 * needed", the author line, and the review date. There is deliberately no
 * rating, review, or download data.
 */
export function toolStructuredData(tool: ToolDefinition, origin: string) {
  const url = `${origin}/tools/${tool.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.title,
    description: tool.shortDescription,
    url,
    applicationCategory: APPLICATION_CATEGORY[tool.category],
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript.",
    inLanguage: "en",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    author: { "@type": "Person", name: "Ali Safari", url: `${origin}/about` },
    publisher: { "@type": "Organization", name: "ASafarIM Digital", url: origin },
    dateModified: tool.lastReviewed,
  };
}
