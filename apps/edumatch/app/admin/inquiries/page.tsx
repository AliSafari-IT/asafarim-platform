"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { useAdminFetch } from "../useAdminFetch";

type Inquiry = {
  id: string;
  subject: string;
  gradeLevel: string;
  status: string;
  moderationOutcome: string | null;
  moderationCategory: string | null;
  createdAt: string;
  student: { id: string; name: string | null; email: string | null };
  aiResponses: { modelUsed: string; moderationOutcome: string | null }[];
};

const STATUS_OPTIONS = ["", "NEW", "AI_RESPONDED", "TUTOR_REQUESTED", "BOOKED", "CLOSED", "REFUSED"] as const;
const MOD_OPTIONS = ["", "ALLOW", "REVIEW", "REFUSE"] as const;

export default function InquiriesPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("");
  const [modFilter, setModFilter] = useState("");

  const params = new URLSearchParams({ limit: "50" });
  if (statusFilter) params.set("status", statusFilter);
  if (modFilter) params.set("moderationOutcome", modFilter);

  const { data, loading, error } = useAdminFetch<{ items: Inquiry[]; total: number }>(
    `/api/admin/inquiries?${params}`,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.admin.inquiries.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">{t("edumatch.admin.inquiries.subtitle")}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || t("edumatch.admin.inquiries.allStatuses")}</option>
          ))}
        </select>
        <select
          value={modFilter}
          onChange={(e) => setModFilter(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        >
          {MOD_OPTIONS.map((m) => (
            <option key={m} value={m}>{m ? `${t("edumatch.admin.inquiries.moderation")}: ${m}` : t("edumatch.admin.inquiries.allModeration")}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.noInquiries")}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">{t("edumatch.admin.common.total", { n: data.total })}</p>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.items.map((i) => (
              <div key={i.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-text)]">{i.subject}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{i.gradeLevel} &middot; {i.student.name ?? i.student.email}</p>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {i.moderationOutcome && (
                    <ModBadge outcome={i.moderationOutcome} category={i.moderationCategory} />
                  )}
                  {i.aiResponses[0] && (
                    <span className="text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.aiModel")}: {i.aiResponses[0].modelUsed}</span>
                  )}
                  <span className="text-[var(--color-text-muted)] ml-auto">{new Date(i.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.subject")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.grade")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.student")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.status")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.moderation")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.aiModel")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.inquiries.created")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                    <td className="px-3 py-2 text-[var(--color-text)]">{i.subject}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{i.gradeLevel}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{i.student.name ?? i.student.email}</td>
                    <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                    <td className="px-3 py-2">
                      {i.moderationOutcome ? (
                        <ModBadge outcome={i.moderationOutcome} category={i.moderationCategory} />
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{i.aiResponses[0]?.modelUsed ?? "-"}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{new Date(i.createdAt).toLocaleDateString()}</td>
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
    NEW: "bg-blue-500/15 text-blue-400",
    AI_RESPONDED: "bg-emerald-500/15 text-emerald-400",
    TUTOR_REQUESTED: "bg-yellow-500/15 text-yellow-400",
    BOOKED: "bg-green-500/15 text-green-400",
    CLOSED: "bg-gray-500/15 text-gray-400",
    REFUSED: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-gray-500/15 text-gray-400"}`}>
      {status}
    </span>
  );
}

function ModBadge({ outcome, category }: { outcome: string; category: string | null }) {
  const colors: Record<string, string> = {
    ALLOW: "bg-green-500/15 text-green-400",
    REVIEW: "bg-yellow-500/15 text-yellow-400",
    REFUSE: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[outcome] ?? "bg-gray-500/15 text-gray-400"}`}>
      {outcome}{category && category !== "NONE" ? ` (${category})` : ""}
    </span>
  );
}
