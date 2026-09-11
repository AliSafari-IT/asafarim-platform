import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "TimelineAI's public journey from visual-timeline MVP to a cited, governed AI storytelling studio.",
};

export default function RoadmapPage() {
  return (
    <main className="px-6 py-10">
      <Roadmap
        kicker="Project direction"
        title="The TimelineAI journey"
        description="A transparent view from the first platform scaffold to the next generation of cited, reviewable AI storytelling. Shipped means demonstrated in code; planned means scoped and sequenced, not date-promised."
        items={roadmapItems}
        labels={{
          changelogTitle: "Built so far",
          changelogSubtitle: "The August 2026 MVP and current reliability work",
          roadmapTitle: "Where the story goes next",
          roadmapSubtitle: "The cited AI storytelling studio epic (#298)",
        }}
      />
    </main>
  );
}
