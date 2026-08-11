"use client";

/**
 * First-run role selection: parent, student (16+), or tutor.
 *
 * The under-16 rule is enforced server-side (upsertStudentProfile refuses a
 * first-time profile with a DOB under 16 — see lib/server/profiles.ts and
 * student-guard.ts) — the client-side age check here is only there to steer
 * a student who picks the wrong card toward the parent flow before they hit
 * that 403, not to replace the boundary.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Role = "parent" | "student" | "tutor" | null;

function isUnder16Client(dateOfBirth: string): boolean {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return true;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  const d = now.getUTCDate() - dob.getUTCDate();
  if (m < 0 || (m === 0 && d < 0)) age -= 1;
  return age < 16;
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [role, setRole] = useState<Role>(null);

  // Student (16+) sub-flow
  const [dob, setDob] = useState("");
  const [dobChecked, setDobChecked] = useState(false);
  const under16 = dobChecked && isUnder16Client(dob);

  // Parent sub-flow
  const [childName, setChildName] = useState("");
  const [childDob, setChildDob] = useState("");
  const [childGrade, setChildGrade] = useState<"K12" | "UNDERGRAD" | "GRAD">("K12");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueAsStudent() {
    if (!dob) {
      setDobChecked(true);
      return;
    }
    setDobChecked(true);
    if (isUnder16Client(dob)) return; // notice is shown inline; no submit
    router.push(`/student/profile?dateOfBirth=${encodeURIComponent(dob)}`);
  }

  async function submitParentAndChild(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const registerRes = await fetch("/api/parent/profile", { method: "POST" });
      if (!registerRes.ok) {
        setError(t("edumatch.onboarding.error"));
        return;
      }
      const childRes = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: childName,
          dateOfBirth: childDob,
          gradeLevel: childGrade,
          subjectsOfInterest: [],
        }),
      });
      if (!childRes.ok) {
        const data = (await childRes.json()) as { error?: string };
        setError(data.error ?? t("edumatch.onboarding.error"));
        return;
      }
      router.push("/parent");
    } catch {
      setError(t("edumatch.onboarding.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">
        {t("edumatch.onboarding.title")}
      </h1>

      {!role && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <RoleCard
            title={t("edumatch.onboarding.role.parent")}
            onClick={() => setRole("parent")}
          />
          <RoleCard
            title={t("edumatch.onboarding.role.student")}
            onClick={() => setRole("student")}
          />
          <RoleCard title={t("edumatch.onboarding.role.tutor")} onClick={() => setRole("tutor")}>
            <Link
              href="/tutor/profile"
              className="mt-3 block rounded-lg bg-[var(--color-primary)] px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90"
            >
              {t("edumatch.onboarding.continue")}
            </Link>
          </RoleCard>
        </div>
      )}

      {role === "student" && (
        <section className="mt-6 max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <label
            htmlFor="onboarding-dob"
            className="mb-2 block text-sm font-medium text-[var(--color-text)]"
          >
            {t("edumatch.profile.student.dateOfBirth")}
          </label>
          <input
            id="onboarding-dob"
            type="date"
            value={dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setDob(e.target.value);
              setDobChecked(false);
            }}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          {dobChecked && !dob && (
            <p className="mt-2 text-xs text-red-700">{t("edumatch.onboarding.dobRequired")}</p>
          )}
          {under16 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("edumatch.onboarding.under16Notice")}{" "}
              <button
                type="button"
                onClick={() => setRole("parent")}
                className="font-medium underline"
              >
                {t("edumatch.onboarding.role.parent")}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => void continueAsStudent()}
            className="mt-4 w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            {t("edumatch.onboarding.continue")}
          </button>
          <button
            type="button"
            onClick={() => setRole(null)}
            className="mt-2 w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            {t("edumatch.onboarding.back")}
          </button>
        </section>
      )}

      {role === "parent" && (
        <form
          onSubmit={(e) => void submitParentAndChild(e)}
          className="mt-6 max-w-sm space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
        >
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {t("edumatch.parent.addChild")}
          </h2>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              {t("edumatch.parent.childName")}
            </label>
            <input
              type="text"
              required
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              {t("edumatch.profile.student.dateOfBirth")}
            </label>
            <input
              type="date"
              required
              value={childDob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setChildDob(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              {t("edumatch.profile.student.gradeLevel")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["K12", "UNDERGRAD", "GRAD"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setChildGrade(g)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    childGrade === g
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] text-[var(--color-text)]"
                  }`}
                >
                  {t(`edumatch.inquiry.new.grade.${g.toLowerCase()}`)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("edumatch.onboarding.continue")}
          </button>
          <button
            type="button"
            onClick={() => setRole(null)}
            className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            {t("edumatch.onboarding.back")}
          </button>
        </form>
      )}
    </div>
  );
}

function RoleCard({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 text-center">
      <p className="font-medium text-[var(--color-text)]">{title}</p>
      {children ?? (
        <button
          type="button"
          onClick={onClick}
          className="mt-3 w-full rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)]"
        >
          {title}
        </button>
      )}
    </div>
  );
}
