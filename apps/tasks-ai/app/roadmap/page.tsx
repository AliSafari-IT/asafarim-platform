import type { Metadata } from "next";
import { Roadmap } from "@asafarim/ui";
import { roadmapItems } from "./data";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <main className="ta-roadmap-page">
      <Roadmap
        kicker="Project direction"
        title="The TasksAI journey"
        description="A transparent view of what has shipped, what is being refined, and where the copilot is heading next. All sixteen milestones (M00–M15) landed as reviewed pull requests — the current build-out is the “creative & useful copilot” epic."
        items={roadmapItems}
        labels={{
          changelogTitle: "Milestones shipped",
          changelogSubtitle: "M00–M15 + the epic-#244 build-out · @asafarim/tasks-ai",
          roadmapTitle: "What's next",
          roadmapSubtitle: "The “creative & useful copilot” epic (#244)",
        }}
      />
    </main>
  );
}
