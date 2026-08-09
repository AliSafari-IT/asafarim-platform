import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "https://tlai.asafarim.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Every private surface — dashboards, admin, the edit workspace, and
      // the API — gets its own server-side auth check regardless, but
      // keeping crawlers out of them too avoids leaking their existence
      // in search results and wasting crawl budget on pages that 401/403.
      disallow: ["/dashboard", "/admin", "/timelines/", "/api/"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
