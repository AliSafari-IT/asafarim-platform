import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What has shipped in Labs, and which experiments are coming next.",
};

export default function RoadmapPage() {
  return (
    <Roadmap
      kicker="History"
      kickerIndex="04"
      title="Roadmap"
      description="What's been added, promoted, paused, or archived in Labs, and what's being explored next. Planned means scoped, not date-promised."
      items={roadmapItems}
      labels={{
        changelogTitle: "Built so far",
        changelogSubtitle: "Experiments and workbench changes that have shipped",
        roadmapTitle: "What's next",
        roadmapSubtitle: "Scoped work and ideas being explored",
      }}
    />
  );
}
