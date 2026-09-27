import type { MetadataRoute } from "next";
import { getPlatformLinks } from "@asafarim/ui";
import { getIndexableTools, hasListedTools } from "../lib/tools/catalogue";
import { toolSitemapEntries } from "../lib/tools/sitemap";

const routes = ["", "/about", "/services", "/projects", "/contact", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const { web } = getPlatformLinks();
  const pages = routes.map((route) => ({
    url: `${web}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
    priority: route === "" ? 1 : 0.7,
  }));
  return [...pages, ...toolSitemapEntries(web, hasListedTools(), getIndexableTools())];
}
