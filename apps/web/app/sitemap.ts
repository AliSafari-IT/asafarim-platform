import type { MetadataRoute } from "next";
import { getPlatformLinks } from "@asafarim/ui";

const routes = ["", "/about", "/services", "/projects", "/contact", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const { web } = getPlatformLinks();

  return routes.map((route) => ({
    url: `${web}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
