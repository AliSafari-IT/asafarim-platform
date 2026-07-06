import type { MetadataRoute } from "next";
import { getPlatformLinks } from "@asafarim/ui";

export default function robots(): MetadataRoute.Robots {
  const { web } = getPlatformLinks();

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${web}/sitemap.xml`,
  };
}
