"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { useAdminFetch } from "./useAdminFetch";

type OverviewData = {
  openVerifications: number;
  disputedBookings: number;
  refusedInquiries: number;
  totalStudents: number;
  totalTutors: number;
  recentBookings: {
    id: string;
    status: string;
    scheduledAt: string;
    createdAt: string;
    student: { name: string | null; email: string | null };
    tutor: { name: string | null; email: string | null };
  }[];
  recentInquiries: {
    id: string;
    subject: string;
    status: string;
    moderationOutcome: string | null;
    createdAt: string;
    student: { name: string | null; email: string | null };
  }[];
  recentTransactions: {
    id: string;
    type: string;
    grossCents: number;
    netCents: number;
    currency: string;
    createdAt: string;
  }[];
  recentAuditEvents: {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    actorRole: string | null;
    createdAt: string;
    actor: { name: string | null; email: string | null } | null;
  }[];
};

const statCards = [
  { key: "openVerifications" as const, labelKey: "edumatch.admin.overview.openVerifications", href: "/admin/tutor-verifications", color: "text-yellow-400" },
  { key: "disputedBookings" as const, labelKey: "edumatch.admin.overview.openDisputes", href: "/admin/disputes", color: "text-red-400" },
  { key: "refusedInquiries" as const, labelKey: "edumatch.admin.overview.refusedInquiries", href: "/admin/inquiries?moderationOutcome=REFUSE", color: "text-orange-400" },
  { key: "totalStudents" as const, labelKey: "edumatch.admin.overview.students", href: "/admin/users", color: "text-emerald-400" },
  { key: "totalTutors" as const, labelKey: "edumatch.admin.overview.tutors", href: "/admin/users", color: "text-blue-400" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function cents(c: number, currency = "EUR") {
  return `${currency === "EUR" ? "€" : "$"}${(c / 100).toFixed(2)}`;
}

export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const { data, loading, error } = useAdminFetch<OverviewData>("/api/admin/overview");

  if (loading) {
    return <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.overview.loading")}</p>;
  }
  if (error) {
    return <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>;
  }
  if (!data) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.admin.overview.title")}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.admin.overview.subtitle")}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        {statCards.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 transition hover:border-emerald-500/40"
          >
            <p className="text-sm text-[var(--color-text-muted)]">{t(s.labelKey)}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{data[s.key]}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent bookings */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[var(--color-text)]">{t("edumatch.admin.overview.recentBookings")}</h2>
            <Link href="/admin/bookings" className="text-xs text-emerald-400 hover:underline">{t("edumatch.admin.overview.viewAll")}</Link>
          </div>
          {data.recentBookings.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.overview.noBookings")}</p>
          ) : (
            <div className="space-y-2">
              {data.recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-[var(--color-text)]">{b.student.name ?? b.student.email}</span>
                    <span className="text-[var(--color-text-muted)]"> &rarr; </span>
                    <span className="text-[var(--color-text)]">{b.tutor.name ?? b.tutor.email}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={b.status} />
                    <span className="text-xs text-[var(--color-text-muted)]">{formatDate(b.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent inquiries */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[var(--color-text)]">{t("edumatch.admin.overview.recentInquiries")}</h2>
            <Link href="/admin/inquiries" className="text-xs text-emerald-400 hover:underline">{t("edumatch.admin.overview.viewAll")}</Link>
          </div>
          {data.recentInquiries.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.overview.noInquiries")}</p>
          ) : (
            <div className="space-y-2">
              {data.recentInquiries.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-[var(--color-text)]">{i.subject}</span>
                    <span className="text-[var(--color-text-muted)]"> by {i.student.name ?? i.student.email}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={i.status} />
                    {i.moderationOutcome === "REFUSE" && (
                      <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">REFUSED</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[var(--color-text)]">{t("edumatch.admin.overview.recentTransactions")}</h2>
            <Link href="/admin/payments" className="text-xs text-emerald-400 hover:underline">{t("edumatch.admin.overview.viewAll")}</Link>
          </div>
          {data.recentTransactions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.overview.noTransactions")}</p>
          ) : (
            <div className="space-y-2">
              {data.recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <TxTypeBadge type={t.type} />
                    <span className="text-[var(--color-text)]">{cents(t.grossCents, t.currency)}</span>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatDate(t.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent audit events */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[var(--color-text)]">{t("edumatch.admin.overview.recentAudit")}</h2>
            <Link href="/admin/audit" className="text-xs text-emerald-400 hover:underline">{t("edumatch.admin.overview.viewAll")}</Link>
          </div>
          {data.recentAuditEvents.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.overview.noAudit")}</p>
          ) : (
            <div className="space-y-2">
              {data.recentAuditEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-[var(--color-text)]">{e.action}</span>
                    <span className="text-[var(--color-text-muted)]"> on {e.entity}</span>
                    {e.actor && (
                      <span className="text-[var(--color-text-muted)]"> by {e.actor.name ?? e.actor.email}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] shrink-0">{formatDate(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SCHEDULED: "bg-blue-500/15 text-blue-400",
    COMPLETED: "bg-green-500/15 text-green-400",
    CANCELLED: "bg-red-500/15 text-red-400",
    DISPUTED: "bg-orange-500/15 text-orange-400",
    NEW: "bg-blue-500/15 text-blue-400",
    AI_RESPONDED: "bg-emerald-500/15 text-emerald-400",
    TUTOR_REQUESTED: "bg-yellow-500/15 text-yellow-400",
    BOOKED: "bg-green-500/15 text-green-400",
    CLOSED: "bg-gray-500/15 text-gray-400",
    REFUSED: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-gray-500/15 text-gray-400"}`}>
      {status}
    </span>
  );
}

function TxTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    CHARGE: "bg-green-500/15 text-green-400",
    REFUND: "bg-red-500/15 text-red-400",
    PAYOUT: "bg-blue-500/15 text-blue-400",
    PLATFORM_FEE: "bg-purple-500/15 text-purple-400",
  };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[type] ?? "bg-gray-500/15 text-gray-400"}`}>
      {type}
    </span>
  );
}
