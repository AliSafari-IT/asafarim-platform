"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@asafarim/ui";

/** Deterministic, locale-independent formatting — `toLocaleString()` here
 *  produced a server/client hydration mismatch (server and browser locales
 *  disagreed on "18/9/2026" vs "18/09/2026"). Matches the `YYYY-MM-DD
 *  HH:MM` shape the rest of this app already uses for dates (see
 *  tailor/page.tsx's `toISOString().slice(0, 10)`). */
function formatTimestamp(value: string | Date): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

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
      <p style={{ opacity: 0.6, fontSize: "0.82rem", margin: "0 0 0.75rem" }}>
        {selected.length === 0
          ? "Check two versions to compare them."
          : selected.length === 1
            ? "Pick one more to compare."
            : "Ready — press Compare selected below."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {resumes.map((resume) => {
          const isSelected = selected.includes(resume.id);
          return (
            <Card key={resume.id}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  margin: "-0.25rem",
                  padding: "0.25rem",
                  borderRadius: "0.6rem",
                  cursor: "pointer",
                  background: isSelected ? "color-mix(in srgb, var(--rm-accent, #4338ca) 8%, transparent)" : undefined,
                }}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggle(resume.id)} style={{ marginTop: "0.15rem" }} />
                <div style={{ flex: 1 }}>
                  <strong>{resume.targetJob.title ?? resume.targetJob.employer ?? "Untitled job"}</strong>
                  {resume.targetJob.employer && resume.targetJob.title ? (
                    <span style={{ opacity: 0.7 }}> · {resume.targetJob.employer}</span>
                  ) : null}
                  <p className="rm-history-item__meta" style={{ margin: "0.3rem 0 0" }}>
                    <span className="jm-mono">
                      {formatTimestamp(resume.createdAt)} UTC · {resume.templateKey} · {resume.modelVersion}
                    </span>
                    {resume.degraded ? <span className="rm-badge rm-badge--warning">Degraded</span> : null}
                  </p>
                </div>
                <a
                  href={`/tailor/${resume.id}/preview`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/tailor/${resume.id}/preview`);
                  }}
                  style={{ fontSize: "0.85rem", flex: "none" }}
                >
                  View
                </a>
              </label>
            </Card>
          );
        })}
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
