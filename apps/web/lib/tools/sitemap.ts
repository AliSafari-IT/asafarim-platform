import type { MetadataRoute } from "next";
import type { ToolDefinition } from "./types";

/**
 * Sitemap entries for the AI Workbench (#681). `/tools` once it lists a
 * public tool; every indexable tool page (beta, stable, paused — never
 * experiments, retired, or internal tools). Results, handoff files, and
 * the tool API have no URLs to list: results live only in the browser, and
 * handoffs are files.
 */
export function toolSitemapEntries(origin: string, catalogueListed: boolean, indexable: readonly ToolDefinition[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  if (catalogueListed) entries.push({ url: `${origin}/tools`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 });
  for (const tool of indexable) {
    if (!tool.indexable || tool.internal || tool.lifecycle === "experiment" || tool.lifecycle === "retired") continue;
    entries.push({ url: `${origin}/tools/${tool.slug}`, lastModified: new Date(`${tool.lastReviewed}T00:00:00Z`), changeFrequency: "monthly", priority: 0.7 });
  }
  return entries;
}
