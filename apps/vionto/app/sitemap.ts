import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_VIONTO_URL ?? "https://vionto.asafarim.com";
  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
