"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@asafarim/ui";
import { LanguageBadge } from "../../components/app/LanguageBadge";

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
  outputLanguage: string | null;
  promptVersion: string;
  modelVersion: string;
  targetJobId: string;
  targetJob: { title: string | null; employer: string | null; sourceUrl: string };
  coverLetter: { id: string } | null;
}

/** Client picker: check exactly two rows, then "Compare" navigates to
 *  /tailor/history/compare/[a]/[b]. Server data stays read-only — this
 *  component only tracks local selection state. */
export function HistoryList({ resumes }: { resumes: HistoryRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  // Which job is currently being re-fetched — see "Refresh title" below.
  // Keyed by targetJobId, not the resume id, since a refresh updates the
  // shared TargetJob row every resume/list entry for it reads from.
  const [refreshingJobId, setRefreshingJobId] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function refreshJob(targetJobId: string) {
    setRefreshingJobId(targetJobId);
    try {
      const response = await fetch("/api/tailor/refresh-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId }),
      });
      if (response.ok) router.refresh();
    } finally {
      setRefreshingJobId(null);
    }
  }

  // Group by UTC day, keeping newest-first order within and across days.
  const days: { day: string; rows: HistoryRow[] }[] = [];
  for (const resume of resumes) {
    const day = formatTimestamp(resume.createdAt).slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(resume);
    else days.push({ day, rows: [resume] });
  }

  return (
    <section className="rx-panel rx-hl" aria-labelledby="rx-hl-title">
      <div className="rx-hl__bar">
        <div>
          <h2 id="rx-hl-title" className="rx-panel__title">
            All versions
          </h2>
          <p className="rx-panel__sub" aria-live="polite">
            {selected.length === 0
              ? "Check two versions to compare them."
              : selected.length === 1
                ? "Pick one more to compare."
                : "Ready — two versions selected."}
          </p>
        </div>
        <Button
          onClick={() => router.push(`/tailor/history/compare/${selected[0]}/${selected[1]}`)}
          disabled={selected.length !== 2}
        >
          Compare selected ({selected.length}/2)
        </Button>
      </div>

      {days.map(({ day, rows }) => (
        <div key={day} className="rx-hl__day">
          <h3 className="rx-hl__date">
            <span className="jm-mono">{day}</span>
            <span className="rx-hl__count">
              {rows.length} version{rows.length === 1 ? "" : "s"}
            </span>
          </h3>
          <ol className="rx-hl__items">
            {rows.map((resume) => {
              const isSelected = selected.includes(resume.id);
              const title = resume.targetJob.title ?? resume.targetJob.employer ?? "Untitled job";
              return (
                <li
                  key={resume.id}
                  className={`rx-hl__item${isSelected ? " rx-hl__item--selected" : ""}${resume.degraded ? " rx-hl__item--degraded" : ""}`}
                >
                  <span className="rx-hl__dot" aria-hidden="true" />
                  <label className="rx-hl__main">
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(resume.id)} />
                    <span className="rx-hl__text">
                      <span className="rx-hl__title">
                        {title}
                        {resume.targetJob.employer && resume.targetJob.title ? (
                          <span className="rx-hl__employer"> · {resume.targetJob.employer}</span>
                        ) : null}
                      </span>
                      <span className="rx-hl__meta">
                        <span className="jm-mono">{formatTimestamp(resume.createdAt).slice(11)} UTC</span>
                        <span className="rx-pill">{resume.templateKey}</span>
                        <LanguageBadge language={resume.outputLanguage} />
                        <span className="jm-mono rx-hl__model">{resume.modelVersion}</span>
                        {resume.coverLetter ? <span className="rx-pill rx-pill--ok">+ Cover letter</span> : null}
                        {resume.degraded ? <span className="rx-pill rx-pill--warm">Degraded</span> : null}
                      </span>
                    </span>
                  </label>
                  <span className="rx-hl__actions">
                    {!resume.targetJob.title && resume.targetJob.sourceUrl.startsWith("http") ? (
                      <button
                        type="button"
                        className="rm-history-item__refresh"
                        disabled={refreshingJobId === resume.targetJobId}
                        onClick={() => refreshJob(resume.targetJobId)}
                      >
                        {refreshingJobId === resume.targetJobId ? "Refreshing…" : "Refresh title"}
                      </button>
                    ) : null}
                    <Link href={`/tailor/${resume.id}/preview`} className="rx-link">
                      View
                    </Link>
                    <Link
                      href={`/ai-usage?job=${encodeURIComponent(resume.targetJobId)}&preset=year`}
                      className="rx-link"
                      aria-label={`AI cost for ${resume.targetJob.title ?? "this job"}`}
                    >
                      AI cost
                    </Link>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
