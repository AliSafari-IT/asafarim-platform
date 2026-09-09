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
        description="A transparent view of what has shipped, what is being refined, and where the copilot is heading next. TasksAI is in early development — every milestone below landed as a reviewed pull request."
        items={roadmapItems}
        labels={{
          changelogTitle: "Milestones shipped",
          changelogSubtitle: "M00–M15 · @asafarim/tasks-ai",
          roadmapTitle: "What's next",
          roadmapSubtitle: "The “creative & useful copilot” epic (#244)",
        }}
      />
    </main>
  );
}
