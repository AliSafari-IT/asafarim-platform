"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@asafarim/ui";

interface HistoryRow {
  id: string;
  createdAt: string | Date;
  templateKey: string;
  degraded: boolean;
  promptVersion: string;
  modelVersion: string;
  targetJob: { title: string | null; employer: string | null };
}

/** Client picker: check exactly two rows, then "Compare" navigates to
 *  /tailor/history/compare/[a]/[b]. Server data stays read-only — this
 *  component only tracks local selection state. */
export function HistoryList({ resumes }: { resumes: HistoryRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {resumes.map((resume) => (
          <Card key={resume.id}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <input
                type="checkbox"
                checked={selected.includes(resume.id)}
                onChange={() => toggle(resume.id)}
                style={{ marginTop: "0.3rem" }}
              />
              <div style={{ flex: 1 }}>
                <strong>{resume.targetJob.title ?? resume.targetJob.employer ?? "Untitled job"}</strong>
                {resume.targetJob.employer && resume.targetJob.title ? (
                  <span style={{ opacity: 0.7 }}> · {resume.targetJob.employer}</span>
                ) : null}
                <p style={{ opacity: 0.6, fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
                  {new Date(resume.createdAt).toLocaleString()} · {resume.templateKey} · {resume.modelVersion}
                  {resume.degraded ? " · degraded" : ""}
                </p>
              </div>
              <a href={`/tailor/${resume.id}/preview`} style={{ fontSize: "0.85rem" }}>
                View
              </a>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Button
          onClick={() => router.push(`/tailor/history/compare/${selected[0]}/${selected[1]}`)}
          disabled={selected.length !== 2}
        >
          Compare selected
        </Button>
      </div>
    </div>
  );
}
