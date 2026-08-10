"use client";

/**
 * The learning record — what makes this a companion rather than a checkout.
 *
 * Session history, what each lesson covered, homework, the next recommended
 * step, and the patterns across all of it: topics that keep coming back,
 * concerns no later lesson has addressed, and how goal progress has moved.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import type {
  JourneyInsightsView,
  JourneySessionView,
} from "@/lib/types/learning";
import { ReviewPrompt } from "@/components/learning/ReviewPrompt";

export default function JourneyPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<JourneySessionView[]>([]);
  const [insights, setInsights] = useState<JourneyInsightsView | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/student/journey");
    if (res.ok) {
      const data = (await res.json()) as {
        sessions: JourneySessionView[];
        insights: JourneyInsightsView;
      };
      setSessions(data.sessions);
      setInsights(data.insights);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.journey.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">
        {t("edumatch.journey.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.journey.subtitle")}
      </p>

      {insights && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label={t("edumatch.journey.stat.completed")}
              value={String(insights.completedSessions)}
            />
            <Stat
              label={t("edumatch.journey.stat.upcoming")}
              value={String(insights.upcomingSessions)}
            />
            <Stat
              label={t("edumatch.journey.stat.progress")}
              value={
                insights.progressTrend.length > 0
                  ? `${insights.progressTrend[insights.progressTrend.length - 1].progress}%`
                  : "—"
              }
            />
          </div>

          {(insights.recurringTopics.length > 0 ||
            insights.openConcerns.length > 0 ||
            insights.approachingDeadlines.length > 0) && (
            <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                {t("edumatch.journey.patterns")}
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm text-[var(--color-text-muted)]">
                {insights.recurringTopics.map((topic) => (
                  <li key={topic.topic}>
                    {t("edumatch.journey.recurring", {
                      topic: topic.topic,
                      n: topic.sessions,
                    })}
                  </li>
                ))}
                {insights.openConcerns.length > 0 && (
                  <li>
                    {t("edumatch.journey.stillOpen", {
                      items: insights.openConcerns.join(", "),
                    })}
                  </li>
                )}
                {insights.approachingDeadlines.map((d) => (
                  <li key={d.briefId}>
                    {t("edumatch.journey.deadlineSoon", {
                      subject: d.subject,
                      date: d.deadlineAt.slice(0, 10),
                    })}{" "}
                    <Link
                      href={`/student/learn?brief=${d.briefId}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {t("edumatch.journey.openBrief")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <h2 className="mt-8 text-base font-semibold text-[var(--color-text)]">
        {t("edumatch.journey.sessions")}
      </h2>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.journey.empty")}
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {sessions.map((s) => (
            <li
              key={s.bookingId}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {s.subject ?? t("edumatch.journey.lesson")} ·{" "}
                    {s.tutorName ?? t("edumatch.match.unnamedTutor")}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {s.scheduledAt.slice(0, 10)} · {s.durationMinutes}{" "}
                    {t("edumatch.common.minutes")} ·{" "}
                    {t(`edumatch.journey.status.${s.status}`)}
                  </p>
                </div>
                {s.goalProgress !== null && (
                  <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
                    {t("edumatch.journey.goalProgress", { n: s.goalProgress })}
                  </span>
                )}
              </div>

              {s.topicsCovered.length > 0 && (
                <p className="mt-3 text-sm text-[var(--color-text)]">
                  {t("edumatch.journey.covered")}: {s.topicsCovered.join(", ")}
                </p>
              )}
              {s.studentSummary && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                  {s.studentSummary}
                </p>
              )}
              {s.homework && (
                <p className="mt-2 text-sm text-[var(--color-text)]">
                  <strong>{t("edumatch.journey.homework")}:</strong> {s.homework}
                </p>
              )}
              {s.nextStep && (
                <p className="mt-2 text-sm text-[var(--color-text)]">
                  <strong>{t("edumatch.journey.nextStep")}:</strong> {s.nextStep}
                </p>
              )}
              {s.resources.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {s.resources.map((r) => (
                    <li key={r.url}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {r.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {s.reviewable && (
                <ReviewPrompt bookingId={s.bookingId} onDone={() => void load()} />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}
