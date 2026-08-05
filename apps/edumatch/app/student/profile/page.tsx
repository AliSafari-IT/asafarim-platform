"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

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

type Profile = {
  gradeLevel: "K12" | "UNDERGRAD" | "GRAD";
  subjectsOfInterest: string[];
  homeAddress?: {
    line1?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
};

export default function StudentProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();

  const GRADE_LEVELS: { value: "K12" | "UNDERGRAD" | "GRAD"; label: string }[] =
    [
      { value: "K12", label: t("edumatch.inquiry.new.grade.k12") },
      { value: "UNDERGRAD", label: t("edumatch.inquiry.new.grade.undergrad") },
      { value: "GRAD", label: t("edumatch.inquiry.new.grade.grad") },
    ];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  const [gradeLevel, setGradeLevel] = useState<"K12" | "UNDERGRAD" | "GRAD">(
    "K12",
  );
  const [subjects, setSubjects] = useState<string[]>([]);
  const [address, setAddress] = useState({
    line1: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  });

  useEffect(() => {
    fetch("/api/student/profile")
      .then(async (r) => {
        if (r.ok) {
          const data: Profile = await r.json();
          setExists(true);
          setGradeLevel(data.gradeLevel);
          setSubjects(data.subjectsOfInterest ?? []);
          if (data.homeAddress) {
            setAddress({
              line1: data.homeAddress.line1 ?? "",
              city: data.homeAddress.city ?? "",
              region: data.homeAddress.region ?? "",
              postalCode: data.homeAddress.postalCode ?? "",
              country: data.homeAddress.country ?? "",
            });
          }
        }
      })
      .catch(() => { /* profile fetch failed — leave form in create mode */ })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload = {
      gradeLevel,
      subjectsOfInterest: subjects,
      homeAddress: address.line1 || address.city ? address : undefined,
    };

    try {
      const res = await fetch("/api/student/profile", {
        method: exists ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? t("edumatch.profile.student.saveFailed"));
        setSaving(false);
        return;
      }

      setSuccess(true);
      setExists(true);
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError(t("edumatch.inquiry.new.networkError"));
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex h-[40vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/student"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          {t("edumatch.profile.student.backToDashboard")}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
        {exists
          ? t("edumatch.profile.student.title.edit")
          : t("edumatch.profile.student.title.create")}
      </h1>
      <p className="text-[var(--color-text-muted)] mb-6">
        {exists
          ? t("edumatch.profile.student.subtitle.edit")
          : t("edumatch.profile.student.subtitle.create")}
      </p>

      <div ref={noticeRef}>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700 flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
            {t("edumatch.profile.student.savedOk")}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Grade Level */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            {t("edumatch.profile.student.gradeLevel")}
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

        {/* Subjects */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
            {t("edumatch.profile.student.subjects")}
          </label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS_OF_INTEREST.map((s) => {
              const active = subjects.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setSubjects((prev) =>
                      active ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {t(`edumatch.subject.${SUBJECT_KEY_BY_LABEL[s]}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.profile.student.subjectsHint")}
          </p>
        </div>

        {/* Address (Optional) */}
        <div className="border-t border-[var(--color-border)] pt-6">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">
            {t("edumatch.profile.student.address.title")}
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder={t("edumatch.profile.student.address.street")}
              value={address.line1}
              onChange={(e) =>
                setAddress({ ...address, line1: e.target.value })
              }
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t("edumatch.profile.student.address.city")}
                value={address.city}
                onChange={(e) =>
                  setAddress({ ...address, city: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <input
                type="text"
                placeholder={t("edumatch.profile.student.address.region")}
                value={address.region}
                onChange={(e) =>
                  setAddress({ ...address, region: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t("edumatch.profile.student.address.postalCode")}
                value={address.postalCode}
                onChange={(e) =>
                  setAddress({ ...address, postalCode: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <input
                type="text"
                placeholder={t("edumatch.profile.student.address.country")}
                value={address.country}
                onChange={(e) =>
                  setAddress({ ...address, country: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("edumatch.profile.student.address.hint")}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link
            href="/student"
            className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
          >
            {t("edumatch.profile.student.cancel")}
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("edumatch.profile.student.saving")}
              </>
            ) : exists ? (
              t("edumatch.profile.student.save")
            ) : (
              t("edumatch.profile.student.create")
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
