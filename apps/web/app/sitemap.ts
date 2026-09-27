import type { MetadataRoute } from "next";
import { getPlatformLinks } from "@asafarim/ui";
import { hasListedTools } from "../lib/tools/catalogue";

const routes = ["", "/about", "/services", "/projects", "/contact", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const { web } = getPlatformLinks();
  // The AI Workbench catalogue is listed once it has a public tool (#674);
  // individual tool pages join in #681.
  const all = hasListedTools() ? [...routes, "/tools"] : routes;

  return all.map((route) => ({
    url: `${web}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
