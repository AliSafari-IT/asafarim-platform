"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  AttachmentUploader,
  humanSize,
  type UploadedAttachment,
} from "@/components/AttachmentUploader";

const SUBJECTS_OF_INTEREST = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "Other",
];

const SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "Art",
  "Music",
  "Languages",
  "Other",
];

const SUBJECT_KEY_BY_LABEL: Record<string, string> = {
  Mathematics: "mathematics",
  Physics: "physics",
  Chemistry: "chemistry",
  Biology: "biology",
  English: "english",
  History: "history",
  Geography: "geography",
  "Computer Science": "computerScience",
  Economics: "economics",
  Art: "art",
  Music: "music",
  Languages: "languages",
  Other: "other",
};

const MAX_CHARS = 4000;
const MIN_CHARS = 10;

export default function NewInquiry() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState<"K12" | "UNDERGRAD" | "GRAD">(
    "K12",
  );
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAttachmentsChange = useCallback(
    (next: UploadedAttachment[]) => setAttachments(next),
    [],
  );

  const GRADE_LEVELS: { value: "K12" | "UNDERGRAD" | "GRAD"; label: string }[] =
    [
      { value: "K12", label: t("edumatch.inquiry.new.grade.k12") },
      { value: "UNDERGRAD", label: t("edumatch.inquiry.new.grade.undergrad") },
      { value: "GRAD", label: t("edumatch.inquiry.new.grade.grad") },
    ];

  const STEPS = [
    t("edumatch.inquiry.new.step.subject"),
    t("edumatch.inquiry.new.step.question"),
    t("edumatch.inquiry.new.step.review"),
  ];

  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileSubjects, setProfileSubjects] = useState<string[]>([]);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const gradeLevelLabel =
    GRADE_LEVELS.find((g) => g.value === gradeLevel)?.label ?? gradeLevel;
  const canProceed0 = subject.length > 0;
  const canProceed1 = description.trim().length >= MIN_CHARS;

  async function submitInquiry() {
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        gradeLevel,
        description: description.trim(),
        attachments,
      }),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (
      res.status === 403 &&
      data.error?.toLowerCase().includes("student profile")
    ) {
      setNeedsProfile(true);
      setProfileSubjects(subject ? [subject] : []);
      setSubmitting(false);
      return;
    }
    if (!res.ok) {
      setError(
        (data.error ?? t("edumatch.inquiry.new.createFailed")) ||
          t("edumatch.inquiry.new.createFailed"),
      );
      setSubmitting(false);
      return;
    }
    router.push(`/student/inquiry/${data.id}`);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitInquiry();
    } catch {
      setError(t("edumatch.inquiry.new.networkError"));
      setSubmitting(false);
    }
  }

  async function handleCreateProfile() {
    setCreatingProfile(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/student/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gradeLevel,
          subjectsOfInterest: profileSubjects,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setProfileError(data.error ?? t("edumatch.profile.student.createFailed"));
        setCreatingProfile(false);
        return;
      }
      setNeedsProfile(false);
      setSubmitting(true);
      await submitInquiry();
    } catch {
      setProfileError(t("edumatch.inquiry.new.networkError"));
      setCreatingProfile(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/student"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.inquiry.new.backToDashboard")}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">
        {t("edumatch.inquiry.new.title")}
      </h1>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                i < step
                  ? "bg-green-500 text-white"
                  : i === step
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                i === step
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 ${i < step ? "bg-green-500" : "bg-[var(--color-border)]"}`}
              />
            )}
          </div>
        ))}
      </div>

      {error && !needsProfile && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {needsProfile && (
        <div className="mb-6 rounded-xl border border-[var(--color-primary)] bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-panel))] p-6">
          <h2 className="text-base font-semibold text-[var(--color-text)] mb-1">
            {t("edumatch.inquiry.new.profile.title")}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-5">
            {t("edumatch.inquiry.new.profile.desc")}
          </p>

          {profileError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {profileError}
            </div>
          )}

          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              {t("edumatch.inquiry.new.profile.grade")}
            </p>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {gradeLevelLabel}
            </p>
          </div>

          <div className="mb-5">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
              {t("edumatch.inquiry.new.profile.subjects")}{" "}
              <span className="normal-case font-normal">
                {t("edumatch.inquiry.new.profile.subjectsOptional")}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS_OF_INTEREST.map((s) => {
                const active = profileSubjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setProfileSubjects((prev) =>
                        active ? prev.filter((x) => x !== s) : [...prev, s],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleCreateProfile}
            disabled={creatingProfile}
            className="w-full rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {creatingProfile ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("edumatch.inquiry.new.profile.creating")}
              </>
            ) : (
              t("edumatch.inquiry.new.profile.createBtn")
            )}
          </button>
        </div>
      )}

      <div
        className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 ${needsProfile ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* Step 0: Subject & Grade */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                {t("edumatch.inquiry.new.subject.label")}
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">
                  {t("edumatch.inquiry.new.subject.placeholder")}
                </option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                {t("edumatch.inquiry.new.grade.label")}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {GRADE_LEVELS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGradeLevel(g.value)}
                    className={`rounded-lg border px-3 py-3 text-sm font-medium text-center transition ${
                      gradeLevel === g.value
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(1)}
                disabled={!canProceed0}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {t("edumatch.inquiry.new.next")}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Description */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("edumatch.inquiry.new.reviewSubject")}
                </p>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {subject} · {gradeLevelLabel}
                </p>
              </div>
              <button
                onClick={() => setStep(0)}
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                {t("edumatch.inquiry.new.change")}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                {t("edumatch.inquiry.new.desc.label")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                maxLength={MAX_CHARS}
                placeholder={t("edumatch.inquiry.new.desc.placeholder")}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
              />
              <div className="flex justify-between mt-1">
                <span
                  className={`text-xs ${description.trim().length < MIN_CHARS ? "text-red-400" : "text-[var(--color-text-muted)]"}`}
                >
                  {description.trim().length < MIN_CHARS
                    ? t("edumatch.inquiry.new.desc.tooShort", {
                        n: MIN_CHARS - description.trim().length,
                      })
                    : t("edumatch.inquiry.new.desc.ok")}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {description.length} / {MAX_CHARS}
                </span>
              </div>
            </div>

            <AttachmentUploader
              onChange={handleAttachmentsChange}
              onUploadingChange={setUploading}
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(0)}
                className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
              >
                {t("edumatch.inquiry.new.back")}
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canProceed1 || uploading}
                className="flex-1 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {uploading
                  ? t("edumatch.inquiry.new.attach.waitUploads")
                  : t("edumatch.inquiry.new.reviewBtn")}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {t("edumatch.inquiry.new.reviewTitle")}
            </h2>

            <div className="rounded-lg bg-[var(--color-surface)] p-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  {t("edumatch.inquiry.new.reviewSubject")}
                </p>
                <p className="text-sm text-[var(--color-text)] mt-0.5">
                  {subject}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  {t("edumatch.inquiry.new.reviewGrade")}
                </p>
                <p className="text-sm text-[var(--color-text)] mt-0.5">
                  {gradeLevelLabel}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  {t("edumatch.inquiry.new.reviewQuestion")}
                </p>
                <p className="text-sm text-[var(--color-text)] mt-0.5 whitespace-pre-wrap line-clamp-6">
                  {description}
                </p>
              </div>
              {attachments.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                    {t("edumatch.inquiry.new.attach.reviewLabel")}
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <li
                        key={att.key}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1 text-xs text-[var(--color-text)]"
                      >
                        <span aria-hidden="true">
                          {att.mime.startsWith("image/")
                            ? "🖼"
                            : att.mime.startsWith("video/")
                              ? "🎬"
                              : att.mime.startsWith("audio/")
                                ? "🎤"
                                : att.mime === "application/pdf"
                                  ? "📄"
                                  : "📎"}
                        </span>
                        <span className="max-w-[160px] truncate">
                          {att.filename}
                        </span>
                        <span className="text-[var(--color-text-muted)]">
                          {humanSize(att.sizeBytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p className="text-xs text-[var(--color-text-muted)]">
              {t("edumatch.inquiry.new.reviewNote")}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
              >
                {t("edumatch.inquiry.new.editBtn")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t("edumatch.inquiry.new.submitting")}
                  </>
                ) : (
                  t("edumatch.inquiry.new.submitBtn")
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
