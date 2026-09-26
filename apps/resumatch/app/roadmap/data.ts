import type { RoadmapItem } from "@asafarim/ui";

/** A milestone without its copy: the title and summary live in
 *  lib/i18n/landing.ts as resumatch.roadmap.<id>.title / .summary, and
 *  `timeframe` is a key under resumatch.roadmap.timeframe.* — see
 *  app/roadmap/page.tsx. */
export type RoadmapMilestone = Omit<RoadmapItem, "title" | "summary" | "timeframe"> & {
  timeframe?: "next" | "later";
};

/**
 * The ResuMatch milestone journey.
 *
 * ResuMatch pivoted from an earlier job-board-aggregation product
 * (JobMatch, M0–M7 in the prior roadmap): rather than ingesting postings
 * from external sources and matching a candidate against them — which
 * turned out to require licensing agreements with job boards this project
 * does not want to pursue — it takes the one posting a candidate supplies
 * and uses AI to tailor their existing CV to it. Outcome-led, same as
 * before: a milestone is "shipped" only when its exit evidence is
 * demonstrated, not when code merges.
 */
export const roadmapMilestones: RoadmapMilestone[] = [
  { id: "M1", status: "shipped", tags: ["infra"] },
  { id: "M2", status: "shipped" },
  { id: "M3", status: "shipped", tags: ["pivot"] },
  { id: "M4", status: "shipped", tags: ["ai"] },
  { id: "M5", status: "shipped", tags: ["ux"] },
  { id: "M6", status: "shipped", tags: ["ai"] },
  { id: "M7", status: "shipped", tags: ["ux"] },
  { id: "M8", status: "shipped", tags: ["ai"] },
  { id: "M9", status: "planned", timeframe: "next", tags: ["ux"] },
  { id: "M10", status: "exploring", timeframe: "later", tags: ["privacy", "ops"] },
];
