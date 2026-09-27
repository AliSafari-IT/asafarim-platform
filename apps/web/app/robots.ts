import type { MetadataRoute } from "next";
import { getPlatformLinks } from "@asafarim/ui";

export default function robots(): MetadataRoute.Robots {
  const { web } = getPlatformLinks();

  return {
    // Tool pages are crawlable; the tool API (runs, results) never is.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${web}/sitemap.xml`,
  };
}
