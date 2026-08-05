"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { useAdminFetch } from "../useAdminFetch";

type Booking = {
  id: string;
  quoteId: string;
  status: string;
  mode: string;
  scheduledAt: string;
  durationMinutes: number;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  student: { id: string; name: string | null; email: string | null };
  tutor: { id: string; name: string | null; email: string | null };
};

const STATUSES = ["", "SCHEDULED", "COMPLETED", "CANCELLED", "DISPUTED"] as const;

export default function BookingsPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("");
  const url = `/api/admin/bookings?limit=50${statusFilter ? `&status=${statusFilter}` : ""}`;
  const { data, loading, error } = useAdminFetch<{ items: Booking[]; total: number }>(url);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.admin.bookings.title")}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{t("edumatch.admin.bookings.subtitle")}</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || t("edumatch.admin.bookings.allStatuses")}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.noBookings")}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">{t("edumatch.admin.common.total", { n: data.total })}</p>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.items.map((b) => (
              <div key={b.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-text)] truncate">
                      {b.student.name ?? b.student.email}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      &rarr; {b.tutor.name ?? b.tutor.email}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
                  <span>{b.mode}</span>
                  <span>{b.durationMinutes}min</span>
                  <span>{new Date(b.scheduledAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.student")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.tutor")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.status")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.mode")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.scheduled")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.duration")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.bookings.created")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                    <td className="px-3 py-2 text-[var(--color-text)]">{b.student.name ?? b.student.email}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{b.tutor.name ?? b.tutor.email}</td>
                    <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{b.mode}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{new Date(b.scheduledAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{b.durationMinutes}min</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{new Date(b.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SCHEDULED: "bg-blue-500/15 text-blue-400",
    COMPLETED: "bg-green-500/15 text-green-400",
    CANCELLED: "bg-red-500/15 text-red-400",
    DISPUTED: "bg-orange-500/15 text-orange-400",
  };
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-gray-500/15 text-gray-400"}`}>
      {status}
    </span>
  );
}
