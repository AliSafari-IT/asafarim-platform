"use client";

/**
 * Write up a lesson.
 *
 * The tutor's two minutes of aftercare are what the student's learning record
 * is made of, so the form asks for exactly the things that show up there:
 * topics covered, a summary the student will read, homework, the next step,
 * progress against the goal, and anything still shaky.
 *
 * `tutorNotes` is the one field the student never sees — a private space for
 * observations that would be unhelpful phrased as feedback.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

const ATTENDANCE = ["ATTENDED", "PARTIAL", "NO_SHOW"] as const;

export default function SessionRecordPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const { t } = useTranslation();

  const [attendance, setAttendance] =
    useState<(typeof ATTENDANCE)[number]>("ATTENDED");
  const [topics, setTopics] = useState("");
  const [studentSummary, setStudentSummary] = useState("");
  const [homework, setHomework] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [tutorNotes, setTutorNotes] = useState("");
  const [openConcerns, setOpenConcerns] = useState("");
  const [goalProgress, setGoalProgress] = useState(50);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from an earlier save — tutors routinely jot the essentials right
  // after a lesson and finish the notes later.
  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/bookings/${bookingId}/session-record`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        record: null | {
          attendance: string;
          topicsCovered: string[];
          studentSummary: string | null;
          homework: string | null;
          nextStep: string | null;
          tutorNotes?: string | null;
          openConcerns: string[];
          goalProgress: number | null;
        };
      };
      if (!data.record) return;
      setAttendance(data.record.attendance as (typeof ATTENDANCE)[number]);
      setTopics(data.record.topicsCovered.join(", "));
      setStudentSummary(data.record.studentSummary ?? "");
      setHomework(data.record.homework ?? "");
      setNextStep(data.record.nextStep ?? "");
      setTutorNotes(data.record.tutorNotes ?? "");
      setOpenConcerns(data.record.openConcerns.join(", "));
      if (data.record.goalProgress !== null) {
        setGoalProgress(data.record.goalProgress);
      }
    })();
  }, [bookingId]);

  function splitList(value: string): string[] {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/session-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendance,
          topicsCovered: splitList(topics),
          studentSummary: studentSummary.trim() || undefined,
          homework: homework.trim() || undefined,
          nextStep: nextStep.trim() || undefined,
          tutorNotes: tutorNotes.trim() || undefined,
          openConcerns: splitList(openConcerns),
          goalProgress,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("edumatch.sessionRecord.error"));
        return;
      }
      setSaved(true);
    } catch {
      setError(t("edumatch.sessionRecord.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/tutor/bookings"
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
      >
        {t("edumatch.sessionRecord.backToBookings")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--color-text)]">
        {t("edumatch.sessionRecord.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.sessionRecord.subtitle")}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {t("edumatch.sessionRecord.saved")}
        </div>
      )}

      <div className="mt-6 space-y-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            {t("edumatch.sessionRecord.attendance")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ATTENDANCE.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAttendance(a)}
                aria-pressed={attendance === a}
                className={`rounded-lg border px-4 py-2 text-sm transition ${
                  attendance === a
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                }`}
              >
                {t(`edumatch.sessionRecord.attendance.${a}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <TextField
          id="topics"
          label={t("edumatch.sessionRecord.topics")}
          hint={t("edumatch.sessionRecord.commaHint")}
          value={topics}
          onChange={setTopics}
        />
        <TextArea
          id="summary"
          label={t("edumatch.sessionRecord.studentSummary")}
          hint={t("edumatch.sessionRecord.studentSummaryHint")}
          value={studentSummary}
          onChange={setStudentSummary}
        />
        <TextArea
          id="homework"
          label={t("edumatch.sessionRecord.homework")}
          value={homework}
          onChange={setHomework}
          rows={2}
        />
        <TextField
          id="next"
          label={t("edumatch.sessionRecord.nextStep")}
          value={nextStep}
          onChange={setNextStep}
        />
        <TextField
          id="concerns"
          label={t("edumatch.sessionRecord.openConcerns")}
          hint={t("edumatch.sessionRecord.commaHint")}
          value={openConcerns}
          onChange={setOpenConcerns}
        />

        <div>
          <label
            htmlFor="progress"
            className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
          >
            {t("edumatch.sessionRecord.goalProgress", { n: goalProgress })}
          </label>
          <input
            id="progress"
            type="range"
            min={0}
            max={100}
            step={5}
            value={goalProgress}
            onChange={(e) => setGoalProgress(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </div>

        <TextArea
          id="private"
          label={t("edumatch.sessionRecord.tutorNotes")}
          hint={t("edumatch.sessionRecord.tutorNotesHint")}
          value={tutorNotes}
          onChange={setTutorNotes}
        />

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="w-full rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? t("edumatch.sessionRecord.saving")
            : t("edumatch.sessionRecord.saveBtn")}
        </button>
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

function TextArea({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}
