import type { MetadataRoute } from "next";
import { prisma } from "@/lib/server/db";

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "https://tlai.asafarim.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: appUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/create`, changeFrequency: "monthly", priority: 0.8 },
  ];

  // Only timelines that anonymous visitors can actually see — the exact
  // same rule as canAccess()'s "view" branch (public/unlisted visibility,
  // and not pending/rejected moderation). Pending guest submissions,
  // private, and rejected timelines must never appear here (spec §4/§8).
  const publicTimelines = await prisma.timeline.findMany({
    where: {
      visibility: "public",
      moderationStatus: { in: ["not_required", "approved"] },
      editingState: "published",
    },
    select: { publicId: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  const timelineRoutes: MetadataRoute.Sitemap = publicTimelines.map((t) => ({
    url: `${appUrl}/t/${t.publicId}`,
    lastModified: t.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...timelineRoutes];
}
