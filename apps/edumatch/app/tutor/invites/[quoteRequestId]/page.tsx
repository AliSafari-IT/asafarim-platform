"use client";

/**
 * The tutor's one-minute screen.
 *
 * Left: the student's full Learning Brief — what they're learning, where they
 * are stuck, what they've uploaded, when they're free. Right: a proposal
 * already filled in from it, with the tutor's own rate and a session-by-session
 * plan. If the prefill is right, "Send proposal" is the only action needed.
 *
 * Nothing here sends automatically. The draft is invisible to the student
 * until the tutor presses Send, and every edit stays local until saved.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { formatEuros, type PlanStepView } from "@/lib/types/learning";

type PreparedBrief = {
  id: string;
  subject: string;
  topic: string | null;
  educationalLevel: string;
  schoolYear: string | null;
  learningObjective: string | null;
  currentUnderstanding: string | null;
  difficulties: string[];
  prerequisiteGaps: string[];
  language: string;
  mode: string;
  locationCity: string | null;
  availability: Array<{ day: string; from: string; to: string }> | null;
  deadlineAt: string | null;
  deadlineKind: string | null;
  accessibilityNeeds: string | null;
  estimatedSessions: number | null;
  sessionMinutes: number | null;
  attachments: Array<{ filename: string; url: string; mime: string }>;
};

type Prepared = {
  quoteId: string;
  status: string;
  expiresAt: string;
  whyYou: string[];
  brief: PreparedBrief;
  draft: {
    sessionCount: number;
    sessionMinutes: number;
    hourlyRateCents: number;
    totalCents: number;
    mode: "ONLINE" | "IN_PERSON";
    language: string;
    earliestStartAt: string;
    planOutline: PlanStepView[];
    preparationNotes: string;
    cancellationPolicy: string;
  };
};

export default function PreparedProposalPage({
  params,
}: {
  params: Promise<{ quoteRequestId: string }>;
}) {
  const { quoteRequestId } = use(params);
  const { t } = useTranslation();
  const router = useRouter();

  const [data, setData] = useState<Prepared | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Local edits to the prefill. Kept separate from `data` so "Send" can post
  // exactly what the tutor sees, in one request.
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [mode, setMode] = useState<"ONLINE" | "IN_PERSON">("ONLINE");
  const [earliestStart, setEarliestStart] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/tutors/proposals/${quoteRequestId}`);
      const payload = (await res.json()) as Prepared & { error?: string };
      if (!res.ok) {
        setError(payload.error ?? t("edumatch.proposal.loadError"));
        setLoading(false);
        return;
      }
      setData(payload);
      setSessionCount(payload.draft.sessionCount);
      setSessionMinutes(payload.draft.sessionMinutes);
      setHourlyRate(payload.draft.hourlyRateCents);
      setMode(payload.draft.mode);
      setEarliestStart(payload.draft.earliestStartAt.slice(0, 10));
      setNotes(payload.draft.preparationNotes);
      setLoading(false);
    })();
  }, [quoteRequestId, t]);

  const total = Math.round((hourlyRate * (sessionCount * sessionMinutes)) / 60);

  function body() {
    return JSON.stringify({
      sessionCount,
      sessionMinutes,
      hourlyRateCents: hourlyRate,
      mode,
      earliestStartAt: new Date(earliestStart).toISOString(),
      preparationNotes: notes,
    });
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tutors/proposals/${quoteRequestId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body(),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? t("edumatch.proposal.sendError"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("edumatch.proposal.sendError"));
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tutors/proposals/${quoteRequestId}/decline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        setError(payload.error ?? t("edumatch.proposal.declineError"));
        return;
      }
      router.push("/tutor/invites");
    } catch {
      setError(t("edumatch.proposal.declineError"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.proposal.loading")}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
        <Link
          href="/tutor/invites"
          className="mt-4 inline-block text-sm text-[var(--color-primary)] hover:underline"
        >
          {t("edumatch.proposal.backToInvites")}
        </Link>
      </div>
    );
  }

  if (!data) return null;
  const b = data.brief;

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">
          {t("edumatch.proposal.sentTitle")}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.proposal.sentDesc")}
        </p>
        <Link
          href="/tutor/invites"
          className="mt-6 inline-block rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {t("edumatch.proposal.backToInvites")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/tutor/invites"
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
      >
        {t("edumatch.proposal.backToInvites")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--color-text)]">
        {b.subject}
        {b.topic ? ` — ${b.topic}` : ""}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.proposal.subtitle")}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* The student's brief */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            {t("edumatch.proposal.briefTitle")}
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <Row label={t("edumatch.brief.field.schoolYear")} value={b.schoolYear ?? b.educationalLevel} />
            <Row label={t("edumatch.brief.field.objective")} value={b.learningObjective} />
            <Row label={t("edumatch.brief.field.understanding")} value={b.currentUnderstanding} />
            <ListRow label={t("edumatch.brief.field.difficulties")} values={b.difficulties} />
            <ListRow label={t("edumatch.brief.field.gaps")} values={b.prerequisiteGaps} />
            <Row label={t("edumatch.brief.field.language")} value={b.language.toUpperCase()} />
            <Row
              label={t("edumatch.brief.field.mode")}
              value={`${t(`edumatch.brief.mode.${b.mode}`)}${b.locationCity ? ` · ${b.locationCity}` : ""}`}
            />
            <Row
              label={t("edumatch.brief.field.availability")}
              value={b.availability
                ?.map((w) => `${w.day} ${w.from}–${w.to}`)
                .join(", ")}
            />
            <Row
              label={t("edumatch.brief.field.deadline")}
              value={b.deadlineAt?.slice(0, 10)}
            />
            <Row
              label={t("edumatch.brief.field.support")}
              value={b.accessibilityNeeds}
            />
          </dl>

          {b.attachments.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                {t("edumatch.brief.field.materials")}
              </p>
              <ul className="mt-2 space-y-1">
                {b.attachments.map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.whyYou.length > 0 && (
            <div className="mt-5 border-t border-[var(--color-border)] pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                {t("edumatch.proposal.whyYou")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {data.whyYou.map((r) => (
                  <li
                    key={r}
                    className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* The prepared proposal */}
        <section className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-panel)] p-6">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            {t("edumatch.proposal.draftTitle")}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.proposal.draftHint")}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField
              id="sessions"
              label={t("edumatch.proposal.field.sessions")}
              value={sessionCount}
              min={1}
              max={50}
              onChange={setSessionCount}
            />
            <NumberField
              id="minutes"
              label={t("edumatch.proposal.field.minutes")}
              value={sessionMinutes}
              min={30}
              max={240}
              step={15}
              onChange={setSessionMinutes}
            />
            <NumberField
              id="rate"
              label={t("edumatch.proposal.field.rate")}
              value={Math.round(hourlyRate / 100)}
              min={0}
              max={1000}
              onChange={(v) => setHourlyRate(v * 100)}
            />
            <div>
              <label
                htmlFor="start"
                className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                {t("edumatch.proposal.field.start")}
              </label>
              <input
                id="start"
                type="date"
                value={earliestStart}
                onChange={(e) => setEarliestStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {t("edumatch.proposal.field.format")}
            </legend>
            <div className="mt-2 flex gap-2">
              {(["ONLINE", "IN_PERSON"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-lg border px-4 py-2 text-sm transition ${
                    mode === m
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {t(`edumatch.brief.mode.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {t("edumatch.proposal.field.plan")}
            </p>
            <ol className="mt-2 space-y-1.5 text-xs text-[var(--color-text-muted)]">
              {data.draft.planOutline.slice(0, sessionCount).map((step) => (
                <li key={step.session}>
                  <strong className="text-[var(--color-text)]">
                    {t("edumatch.compare.session", { n: step.session })}
                  </strong>{" "}
                  {step.focus}
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-4">
            <label
              htmlFor="prep"
              className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              {t("edumatch.proposal.field.prep")}
            </label>
            <textarea
              id="prep"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="mt-5 rounded-lg bg-[var(--color-surface)] px-4 py-3">
            <p className="flex items-baseline justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">
                {t("edumatch.proposal.total")}
              </span>
              <strong className="text-lg text-[var(--color-text)]">
                {formatEuros(total)}
              </strong>
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {t("edumatch.proposal.totalBreakdown", {
                n: sessionCount,
                m: sessionMinutes,
                rate: formatEuros(hourlyRate),
              })}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t("edumatch.proposal.sending") : t("edumatch.proposal.sendBtn")}
            </button>
            <button
              type="button"
              onClick={() => void decline()}
              disabled={busy}
              className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)] disabled:opacity-50"
            >
              {t("edumatch.proposal.declineBtn")}
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.proposal.nothingAutoSent")}
          </p>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

function ListRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5">
        <ul className="list-inside list-disc text-[var(--color-text)]">
          {values.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}
