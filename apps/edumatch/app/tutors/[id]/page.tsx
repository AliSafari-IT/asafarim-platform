"use client";

/**
 * A tutor's public, dynamic resume — the detail view behind the compact
 * summary shown on compare cards. Everything here is verified/derived from
 * completed sessions and reviews, never self-declared. See getTutorResume()
 * in lib/server/tutor-resume.ts.
 */

import { use, useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

const NEW_TUTOR_REVIEW_THRESHOLD = 3;

type TutorResumeView = {
  sessionsTaught: number;
  distinctStudents: number;
  totalTeachingMinutes: number;
  subjectsTaughtWithCounts: Array<{ subject: string; sessions: number }>;
  averageGoalProgress: number | null;
  currentStreakWeeks: number | null;
  ratingBreakdown: {
    overall: { avg: number; count: number };
    clarity: { avg: number | null; count: number };
    reliability: { avg: number | null; count: number };
    engagement: { avg: number | null; count: number };
  };
  recentReviews: Array<{
    rating: number;
    clarity: number | null;
    reliability: number | null;
    engagement: number | null;
    comment: string | null;
    createdAt: string;
    subject: string | null;
  }>;
  milestones: Array<{ key: string; labelKey: string }>;
};

type TutorPublicProfile = {
  tutorId: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  subjectsTaught: string[];
  levelsTaught: string[];
  teachingStyle: string | null;
  verified: boolean;
  resume: TutorResumeView;
};

export default function TutorPublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tutorId } = use(params);
  const { t } = useTranslation();
  const [data, setData] = useState<TutorPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/tutors/${tutorId}/resume`);
      if (cancelled) return;
      if (!res.ok) {
        setError(t("edumatch.resume.loadError"));
        setLoading(false);
        return;
      }
      setData((await res.json()) as TutorPublicProfile);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tutorId, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.resume.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-red-700">
        {error ?? t("edumatch.resume.loadError")}
      </div>
    );
  }

  const { resume } = data;
  const confident = resume.ratingBreakdown.overall.count >= NEW_TUTOR_REVIEW_THRESHOLD;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex items-start gap-4">
        {data.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
            {data.name ?? t("edumatch.match.unnamedTutor")}
            {data.verified && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800">
                {t("edumatch.match.verified")}
              </span>
            )}
          </h1>
          {data.bio && (
            <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
              {data.bio}
            </p>
          )}
        </div>
      </header>

      {resume.milestones.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {resume.milestones.map((m) => (
            <li
              key={m.key}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs font-medium text-[var(--color-text)]"
            >
              {t(m.labelKey)}
            </li>
          ))}
        </ul>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("edumatch.resume.sessionsTaught")} value={resume.sessionsTaught} />
        <Stat label={t("edumatch.resume.distinctStudents")} value={resume.distinctStudents} />
        <Stat
          label={t("edumatch.resume.hoursTaught")}
          value={Math.round((resume.totalTeachingMinutes / 60) * 10) / 10}
        />
        <Stat
          label={t("edumatch.resume.avgGoalProgress")}
          value={
            resume.averageGoalProgress !== null ? `${resume.averageGoalProgress}%` : "—"
          }
        />
      </section>

      <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          {t("edumatch.resume.ratingBreakdown")}
        </h2>
        {!confident && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.filter.newBadge")} —{" "}
            {t("edumatch.resume.basedOnN", { n: resume.ratingBreakdown.overall.count })}
          </p>
        )}
        <div className="mt-3 space-y-2">
          <AspectBar
            label={t("edumatch.resume.overall")}
            avg={resume.ratingBreakdown.overall.avg}
            count={resume.ratingBreakdown.overall.count}
          />
          <AspectBar
            label={t("edumatch.review.aspect.clarity")}
            avg={resume.ratingBreakdown.clarity.avg}
            count={resume.ratingBreakdown.clarity.count}
          />
          <AspectBar
            label={t("edumatch.review.aspect.reliability")}
            avg={resume.ratingBreakdown.reliability.avg}
            count={resume.ratingBreakdown.reliability.count}
          />
          <AspectBar
            label={t("edumatch.review.aspect.engagement")}
            avg={resume.ratingBreakdown.engagement.avg}
            count={resume.ratingBreakdown.engagement.count}
          />
        </div>
      </section>

      {resume.recentReviews.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {t("edumatch.resume.recentReviews")}
          </h2>
          <ul className="mt-3 space-y-3">
            {resume.recentReviews.map((r, i) => (
              // Reviewer identity is deliberately never included — see
              // getTutorResume()'s comment on anonymity.
              <li
                key={i}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-sm"
              >
                <p className="font-medium text-[var(--color-text)]">
                  {"★".repeat(r.rating)}
                  {r.subject && (
                    <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
                      {r.subject}
                    </span>
                  )}
                </p>
                {r.comment && (
                  <p className="mt-1 text-[var(--color-text-muted)]">{r.comment}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-center">
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
    </div>
  );
}

function AspectBar({
  label,
  avg,
  count,
}: {
  label: string;
  avg: number | null;
  count: number;
}) {
  const confident = count >= NEW_TUTOR_REVIEW_THRESHOLD;
  const pct = avg !== null ? Math.max(0, Math.min(100, (avg / 5) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text)]">{label}</span>
        <span className="text-[var(--color-text-muted)]">
          {confident && avg !== null ? avg.toFixed(1) : "—"}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)]"
          style={{ width: `${confident ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}
