import type { Metadata } from "next";
import { PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Changelog" };

const ENTRIES = [
  {
    date: "2026-08-12",
    summary: "Labs workbench scaffolded — 3 launch experiments, ideas pipeline, status API.",
  },
];

export default function ChangelogPage() {
  return (
    <>
      <PageHeader
        kicker="History"
        kickerIndex="04"
        title="Changelog"
        description="What's been promoted, paused, or archived in Labs."
      />
      <ol style={{ borderLeft: "2px solid var(--labs-accent)", paddingLeft: "1rem", marginTop: "1.5rem" }}>
        {ENTRIES.map((entry) => (
          <li key={entry.date} style={{ marginBottom: "1rem" }}>
            <span className="labs-mono" style={{ opacity: 0.6 }}>
              {entry.date}
            </span>{" "}
            — {entry.summary}
          </li>
        ))}
      </ol>
    </>
  );
}
