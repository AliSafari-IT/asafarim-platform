"use client";

/**
 * Parent dashboard: the list of managed children, plus adding another one.
 *
 * Deep per-child views (bookings, learning journey, messaging) are out of
 * scope for this first cut — see #142's "Parent flow" section for the full
 * shape. This page covers the acceptance-critical path: a parent can see
 * and grow their list of children.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

type Child = {
  userId: string;
  name: string | null;
  image: string | null;
  gradeLevel: string;
  dateOfBirth: string | null;
  createdAt: string;
};

export default function ParentDashboardPage() {
  const { t } = useTranslation();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childDob, setChildDob] = useState("");
  const [childGrade, setChildGrade] = useState<"K12" | "UNDERGRAD" | "GRAD">("K12");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/parent/children");
    if (res.ok) {
      const data = (await res.json()) as { children: Child[] };
      setChildren(data.children);
    } else {
      setError(t("edumatch.parent.loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: childName,
          dateOfBirth: childDob,
          gradeLevel: childGrade,
          subjectsOfInterest: [],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t("edumatch.parent.loadError"));
        return;
      }
      setChildName("");
      setChildDob("");
      setShowAddChild(false);
      await load();
    } catch {
      setError(t("edumatch.parent.loadError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">
        {t("edumatch.parent.dashboard.title")}
      </h1>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {children === null ? (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.parent.loading")}
        </p>
      ) : children.length === 0 && !showAddChild ? (
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("edumatch.parent.noStudents")}
          </p>
          <button
            type="button"
            onClick={() => setShowAddChild(true)}
            className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t("edumatch.parent.addChild")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {children.map((c) => (
              <div
                key={c.userId}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
              >
                {c.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {c.name ?? t("edumatch.parent.unnamedChild")}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">{c.gradeLevel}</p>
                </div>
              </div>
            ))}
          </div>

          {!showAddChild && (
            <button
              type="button"
              onClick={() => setShowAddChild(true)}
              className="mt-4 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            >
              {t("edumatch.parent.addChild")}
            </button>
          )}
        </>
      )}

      {showAddChild && (
        <form
          onSubmit={(e) => void addChild(e)}
          className="mt-6 max-w-sm space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
        >
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
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("edumatch.onboarding.continue")}
            </button>
            <button
              type="button"
              onClick={() => setShowAddChild(false)}
              className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            >
              {t("edumatch.profile.student.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
