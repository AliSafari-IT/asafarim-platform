import type { Metadata } from "next";
import { PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Ideas" };

type IdeaStage = "raw" | "prototype" | "released";

const IDEAS: { label: string; stage: IdeaStage; leadsTo?: string }[] = [
  { label: "Interactive idea board", stage: "raw" },
  { label: "Brainstorming canvas (ASCII + JSON schema)", stage: "raw" },
  { label: "ADR visualizer", stage: "raw" },
  { label: "Latency & cost heatmaps", stage: "raw" },
  { label: "Timeline layout lab", stage: "prototype", leadsTo: "/experiments/timeline-layout" },
  { label: "UI playground", stage: "prototype", leadsTo: "/experiments/ui-playground" },
  { label: "AI eval explorer", stage: "prototype", leadsTo: "/experiments/ai-eval-explorer" },
];

const STAGES: IdeaStage[] = ["raw", "prototype", "released"];

export default function IdeasPage() {
  return (
    <>
      <PageHeader
        kicker="Pipeline"
        kickerIndex="03"
        title="Ideas"
        description="Raw concepts flow into active prototypes, and prototypes graduate to Showcase releases. This is a static snapshot for now — a real graph view is on the idea list itself."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginTop: "1.5rem" }}>
        {STAGES.map((stage) => (
          <div key={stage} className="labs-drawer">
            <div className="labs-mono" style={{ fontSize: "0.75rem", opacity: 0.6, textTransform: "uppercase" }}>
              {stage}
            </div>
            <ul style={{ paddingLeft: "1.1rem" }}>
              {IDEAS.filter((i) => i.stage === stage).map((i) => (
                <li key={i.label} style={{ margin: "0.4rem 0" }}>
                  {i.leadsTo ? <a href={i.leadsTo}>{i.label}</a> : i.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
