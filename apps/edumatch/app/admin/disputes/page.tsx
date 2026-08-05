"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { useAdminFetch } from "../useAdminFetch";

type Dispute = {
  id: string;
  quoteId: string;
  status: string;
  mode: string;
  scheduledAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
  student: { id: string; name: string | null; email: string | null };
  tutor: { id: string; name: string | null; email: string | null };
  transactions: { id: string; type: string; grossCents: number; netCents: number; createdAt: string }[];
};

export default function DisputesPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAdminFetch<{ items: Dispute[]; total: number }>("/api/admin/disputes");
  const [busy, setBusy] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function resolve(bookingId: string, resolution: "REFUND" | "NO_REFUND" | "REQUEST_INFO") {
    setBusy(bookingId);
    setResolveError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${bookingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, reason: notes[bookingId] || `Admin resolved: ${resolution}` }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      setResolveError(localizeAdminDisputeError(e, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.admin.disputes.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t("edumatch.admin.disputes.subtitle")}</p>

      {(error || resolveError) && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error || resolveError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.disputes.noDisputes")}</p>
      ) : (
        <div className="space-y-4">
          {data.items.map((d) => (
            <div key={d.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-semibold text-[var(--color-text)]">
                    {d.student.name ?? d.student.email} &rarr; {d.tutor.name ?? d.tutor.email}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {t("edumatch.admin.disputes.booking")} {d.id.slice(0, 8)}... &middot; {d.mode} &middot;{" "}
                    {t("edumatch.admin.disputes.scheduled")} {new Date(d.scheduledAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">DISPUTED</span>
              </div>

              {d.cancellationReason && (
                <p className="text-sm text-[var(--color-text)] opacity-80 mb-3 whitespace-pre-wrap">{d.cancellationReason}</p>
              )}

              {d.transactions.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                    {t("edumatch.admin.disputes.transactions")}
                  </p>
                  {d.transactions.map((t) => (
                    <p key={t.id} className="text-xs text-[var(--color-text-muted)]">
                      {t.type}: &euro;{(t.grossCents / 100).toFixed(2)} ({new Date(t.createdAt).toLocaleDateString()})
                    </p>
                  ))}
                </div>
              )}

              <div className="mb-3">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t("edumatch.admin.disputes.resolutionNotes")}</label>
                <textarea
                  value={notes[d.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                  rows={2}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)]"
                  placeholder={t("edumatch.admin.disputes.notesPlaceholder")}
                />
              </div>

              <div className="flex gap-2">
                <button
                  disabled={busy === d.id}
                  onClick={() => resolve(d.id, "REQUEST_INFO")}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy === d.id ? t("edumatch.admin.disputes.working") : t("edumatch.admin.disputes.requestInfo")}
                </button>
                <button
                  disabled={busy === d.id}
                  onClick={() => resolve(d.id, "REFUND")}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy === d.id ? t("edumatch.admin.disputes.working") : t("edumatch.admin.disputes.refund")}
                </button>
                <button
                  disabled={busy === d.id}
                  onClick={() => resolve(d.id, "NO_REFUND")}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {t("edumatch.admin.disputes.noRefund")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function localizeAdminDisputeError(
  error: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const message = error instanceof Error ? error.message : "";
  if (/can only resolve disputed/i.test(message)) {
    return t("edumatch.admin.disputes.error.notDisputed");
  }
  if (/notes are required|reason.*required|required/i.test(message)) {
    return t("edumatch.admin.disputes.error.notesRequired");
  }
  return t("edumatch.admin.disputes.resolveFailed");
}
