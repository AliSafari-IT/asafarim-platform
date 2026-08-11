"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Inquiry = {
  id: string;
  subject: string;
  gradeLevel: string;
  description: string;
  status: string;
  createdAt: string;
};

export default function StudentDashboard() {
  const { t, locale } = useTranslation();
  const { data: session, status } = useSession();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const signinUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/auth/signin`
    : "/api/auth/signin";
  const EDUMATCH_URL =
    process.env.NEXT_PUBLIC_EDUMATCH_URL || "https://edumatch.asafarim.com";

  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([
        fetch(`${EDUMATCH_URL}/api/inquiries`)
          .then((r) => r.json())
          .catch(() => ({ items: [] })),
        fetch(`${EDUMATCH_URL}/api/student/profile`)
          .then((r) => ({ ok: r.ok }))
          .catch(() => ({ ok: false })),
      ]).then(([inquiryData, profileData]) => {
        setInquiries((inquiryData as { items?: Inquiry[] }).items ?? []);
        setHasProfile((profileData as { ok: boolean }).ok);
        setLoading(false);
      });
    }
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">
            {t("edumatch.student.signInRequired")}
          </h1>
          <Link
            href={signinUrl}
            className="text-[var(--color-primary)] hover:underline"
          >
            {t("edumatch.student.signIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {hasProfile === false && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <div className="mt-0.5 text-amber-500 text-xl">⚠</div>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              {t("edumatch.student.profileMissing.title")}
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {t("edumatch.student.profileMissing.desc")}
            </p>
          </div>
          <Link
            href={`${EDUMATCH_URL}/student/profile`}
            className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
          >
            {t("edumatch.student.profileMissing.action")}
          </Link>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--color-text)]">
          {t("edumatch.dashboard.inquiries")}
        </h2>
        <div className="flex items-center gap-3">
          <Link
            href={`${EDUMATCH_URL}/student/profile`}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
          >
            {hasProfile
              ? t("edumatch.student.editProfile")
              : t("edumatch.student.createProfile")}
          </Link>
          <Link
            href={`${EDUMATCH_URL}/student/bookings`}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] transition"
          >
            {tx(t, locale, "edumatch.student.bookings.title", {
              en: "My Bookings",
              nl: "Mijn boekingen",
              fr: "Mes réservations",
              de: "Meine Buchungen",
            })}
          </Link>
          <Link
            href={`${EDUMATCH_URL}/student/learn`}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            {t("edumatch.dashboard.askQuestion")}
          </Link>
        </div>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 text-center">
          <p className="mb-4 text-[var(--color-text-muted)]">
            {t("edumatch.dashboard.noInquiries")}
          </p>
          <Link
            href={`${EDUMATCH_URL}/student/learn`}
            className="text-[var(--color-primary)] hover:underline"
          >
            {t("edumatch.dashboard.askFirst")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {inquiries.map((inquiry) => (
            <Link
              key={inquiry.id}
              href={`${EDUMATCH_URL}/student/inquiry/${inquiry.id}`}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 transition hover:border-[var(--color-primary)] hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                    {inquiry.subject}
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {inquiry.gradeLevel}
                  </p>
                </div>
                <StatusBadge status={inquiry.status} t={t} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text-muted)]">
                {inquiry.description}
              </p>
              <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                {new Date(inquiry.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function tx(
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string,
  key: string,
  fallback: Record<string, string>,
) {
  const value = t(key);
  if (value !== key) return value;
  const base = locale.toLowerCase().split("-")[0];
  return fallback[base] ?? fallback.en ?? key;
}

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const styles: Record<string, string> = {
    NEW: "bg-gray-100 text-gray-700",
    AI_RESPONDED: "bg-blue-100 text-blue-700",
    TUTOR_REQUESTED: "bg-yellow-100 text-yellow-700",
    BOOKED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] || styles.NEW}`}
    >
      {t("edumatch.status." + status) || status.replace("_", " ")}
    </span>
  );
}
