"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

type StudentProfile = {
  id: string;
  gradeLevel: string;
  subjectsOfInterest: string[];
  homeLat: number | null;
  homeLng: number | null;
  createdAt: string;
  updatedAt: string;
};

type TutorProfile = {
  id: string;
  bio: string | null;
  subjectsTaught: string[];
  levelsTaught: string[];
  hourlyRateCents: number;
  onlineOnly: boolean;
  serviceRadiusKm: number;
  payoutEnabled: boolean;
  verifiedAt: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
};

type UserDetail = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  studentProfile: StudentProfile | null;
  tutorProfile: TutorProfile | null;
};

function money(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <div className="text-sm text-[var(--color-text)]">{children}</div>
    </div>
  );
}

function Tags({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-[var(--color-text-muted)]">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span
          key={s}
          className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)]"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export default function UserDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUser(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (params.id) void load(params.id);
  }, [load, params.id]);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ← {t("edumatch.admin.users.detail.back")}
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : notFound ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.users.detail.notFound")}</p>
      ) : user ? (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">{user.name ?? "-"}</h1>
              <p className="text-sm text-[var(--color-text-muted)]">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {user.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          {/* Account */}
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
              {t("edumatch.admin.users.detail.accountTitle")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label={t("edumatch.admin.users.detail.status")}>
                {user.isActive ? (
                  <span className="text-green-400">{t("edumatch.admin.users.detail.active")}</span>
                ) : (
                  <span className="text-red-400">{t("edumatch.admin.users.detail.inactive")}</span>
                )}
              </Field>
              <Field label={t("edumatch.admin.users.joined")}>
                {new Date(user.createdAt).toLocaleDateString()}
              </Field>
              <Field label={t("edumatch.admin.users.detail.phone")}>{user.phone ?? "-"}</Field>
              <Field label={t("edumatch.admin.users.detail.location")}>{user.location ?? "-"}</Field>
              {user.bio && (
                <div className="col-span-2 sm:col-span-3">
                  <Field label={t("edumatch.admin.users.detail.bio")}>{user.bio}</Field>
                </div>
              )}
            </div>
          </section>

          {/* Student profile */}
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
              {t("edumatch.admin.users.detail.studentProfileTitle")}
            </h2>
            {user.studentProfile ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label={t("edumatch.admin.users.detail.gradeLevel")}>
                  {user.studentProfile.gradeLevel}
                </Field>
                <div className="col-span-2">
                  <Field label={t("edumatch.admin.users.detail.subjectsOfInterest")}>
                    <Tags items={user.studentProfile.subjectsOfInterest} />
                  </Field>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                {t("edumatch.admin.users.detail.noStudentProfile")}
              </p>
            )}
          </section>

          {/* Tutor profile */}
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
              {t("edumatch.admin.users.detail.tutorProfileTitle")}
            </h2>
            {user.tutorProfile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label={t("edumatch.admin.users.tutorStatus")}>
                    {user.tutorProfile.verifiedAt ? (
                      <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">
                        {t("edumatch.admin.users.verified")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-[10px] text-yellow-400">
                        {t("edumatch.admin.users.unverified")}
                      </span>
                    )}
                  </Field>
                  <Field label={t("edumatch.admin.users.detail.rating")}>
                    {user.tutorProfile.ratingCount > 0
                      ? `★ ${user.tutorProfile.ratingAvg.toFixed(1)} (${user.tutorProfile.ratingCount})`
                      : t("edumatch.admin.users.detail.noRatingsYet")}
                  </Field>
                  <Field label={t("edumatch.admin.users.detail.hourlyRate")}>
                    {money(user.tutorProfile.hourlyRateCents)}
                  </Field>
                  <Field label={t("edumatch.admin.users.detail.serviceRadius")}>
                    {user.tutorProfile.onlineOnly
                      ? t("edumatch.admin.users.detail.onlineOnly")
                      : `${user.tutorProfile.serviceRadiusKm} km`}
                  </Field>
                  <Field label={t("edumatch.admin.users.detail.payoutEnabled")}>
                    {user.tutorProfile.payoutEnabled
                      ? t("edumatch.admin.users.detail.yes")
                      : t("edumatch.admin.users.detail.no")}
                  </Field>
                  <Field label={t("edumatch.admin.users.detail.verifiedAt")}>
                    {user.tutorProfile.verifiedAt
                      ? new Date(user.tutorProfile.verifiedAt).toLocaleDateString()
                      : t("edumatch.admin.users.detail.notVerified")}
                  </Field>
                </div>
                <Field label={t("edumatch.admin.users.detail.subjectsTaught")}>
                  <Tags items={user.tutorProfile.subjectsTaught} />
                </Field>
                <Field label={t("edumatch.admin.users.detail.levelsTaught")}>
                  <Tags items={user.tutorProfile.levelsTaught} />
                </Field>
                {user.tutorProfile.bio && (
                  <Field label={t("edumatch.admin.users.detail.bio")}>{user.tutorProfile.bio}</Field>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                {t("edumatch.admin.users.detail.noTutorProfile")}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
