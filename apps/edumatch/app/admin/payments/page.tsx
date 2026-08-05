"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { useAdminFetch } from "../useAdminFetch";

type Transaction = {
  id: string;
  bookingId: string;
  type: string;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  currency: string;
  stripeChargeId: string | null;
  stripePayoutId: string | null;
  createdAt: string;
  tutor: { id: string; name: string | null; email: string | null };
};

type WalletRow = {
  tutorId: string;
  balanceCents: number;
  pendingCents: number;
  lastPayoutAt: string | null;
  currency: string;
  tutor: { name: string | null; email: string | null };
};

const TX_TYPES = ["", "CHARGE", "REFUND", "PAYOUT", "PLATFORM_FEE"] as const;

function cents(c: number, cur = "EUR") {
  return `${cur === "EUR" ? "€" : "$"}${(Math.abs(c) / 100).toFixed(2)}`;
}

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"transactions" | "wallets">("transactions");
  const [typeFilter, setTypeFilter] = useState("");

  const txUrl = `/api/admin/transactions?limit=50${typeFilter ? `&type=${typeFilter}` : ""}`;
  const walletUrl = "/api/admin/transactions?view=wallets&limit=50";

  const tx = useAdminFetch<{ items: Transaction[]; total: number }>(txUrl);
  const wallets = useAdminFetch<{ items: WalletRow[]; total: number }>(walletUrl);

  const active = tab === "transactions";

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.admin.payments.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">{t("edumatch.admin.payments.subtitle")}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 mb-6">
        <div className="flex gap-2">
          {(["transactions", "wallets"] as const).map((tabName) => (
            <button
              key={tabName}
              onClick={() => setTab(tabName)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
                tab === tabName
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-panel)]"
              }`}
            >
              {tabName === "transactions" ? t("edumatch.admin.payments.transactions") : t("edumatch.admin.payments.wallets")}
            </button>
          ))}
        </div>
        {active && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full sm:w-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
          >
            {TX_TYPES.map((txType) => (
              <option key={txType} value={txType}>{txType || t("edumatch.admin.payments.allTypes")}</option>
            ))}
          </select>
        )}
      </div>

      {active ? (
        <>
          {tx.error && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{tx.error}</div>}

          {tx.loading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
          ) : !tx.data || tx.data.items.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.payments.noTransactions")}</p>
          ) : (
            <>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">{t("edumatch.admin.common.total", { n: tx.data.total })}</p>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {tx.data.items.map((transaction) => (
                  <div key={transaction.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <TxBadge type={transaction.type} />
                        <span className="font-semibold text-[var(--color-text)]">{cents(transaction.grossCents, transaction.currency)}</span>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">{new Date(transaction.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] space-y-0.5">
                      <p>{t("edumatch.admin.payments.tutor")}: {transaction.tutor.name ?? transaction.tutor.email}</p>
                      <p>{t("edumatch.admin.payments.fee")}: {cents(transaction.platformFeeCents, transaction.currency)} &middot; {t("edumatch.admin.payments.net")}: {transaction.netCents < 0 ? "-" : ""}{cents(transaction.netCents, transaction.currency)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.type")}</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.tutor")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.gross")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.fee")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.net")}</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.data.items.map((t) => (
                      <tr key={t.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                        <td className="px-3 py-2"><TxBadge type={t.type} /></td>
                        <td className="px-3 py-2 text-[var(--color-text)]">{t.tutor.name ?? t.tutor.email}</td>
                        <td className="px-3 py-2 text-right text-[var(--color-text)]">{cents(t.grossCents, t.currency)}</td>
                        <td className="px-3 py-2 text-right text-[var(--color-text-muted)]">{cents(t.platformFeeCents, t.currency)}</td>
                        <td className="px-3 py-2 text-right text-[var(--color-text)]">{t.netCents < 0 ? "-" : ""}{cents(t.netCents, t.currency)}</td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">{new Date(t.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {wallets.error && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{wallets.error}</div>}
          {wallets.loading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
          ) : !wallets.data || wallets.data.items.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.payments.noWallets")}</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {wallets.data.items.map((w) => (
                  <div key={w.tutorId} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                    <p className="font-semibold text-[var(--color-text)] mb-2">{w.tutor.name ?? w.tutor.email}</p>
                    <div className="flex gap-4 text-xs">
                      <div>
                        <p className="text-[var(--color-text-muted)]">{t("edumatch.admin.payments.balance")}</p>
                        <p className="font-medium text-[var(--color-text)]">{cents(w.balanceCents, w.currency)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--color-text-muted)]">{t("edumatch.admin.payments.pending")}</p>
                        <p className="font-medium text-yellow-400">{cents(w.pendingCents, w.currency)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--color-text-muted)]">{t("edumatch.admin.payments.lastPayout")}</p>
                        <p className="text-[var(--color-text)]">{w.lastPayoutAt ? new Date(w.lastPayoutAt).toLocaleDateString() : t("edumatch.admin.payments.never")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.tutor")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.balance")}</th>
                      <th className="px-3 py-2 text-right font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.pending")}</th>
                      <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.payments.lastPayout")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallets.data.items.map((w) => (
                      <tr key={w.tutorId} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                        <td className="px-3 py-2 text-[var(--color-text)]">{w.tutor.name ?? w.tutor.email}</td>
                        <td className="px-3 py-2 text-right text-[var(--color-text)]">{cents(w.balanceCents, w.currency)}</td>
                        <td className="px-3 py-2 text-right text-yellow-400">{cents(w.pendingCents, w.currency)}</td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">{w.lastPayoutAt ? new Date(w.lastPayoutAt).toLocaleDateString() : t("edumatch.admin.payments.never")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TxBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    CHARGE: "bg-green-500/15 text-green-400",
    REFUND: "bg-red-500/15 text-red-400",
    PAYOUT: "bg-blue-500/15 text-blue-400",
    PLATFORM_FEE: "bg-purple-500/15 text-purple-400",
  };
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[type] ?? "bg-gray-500/15 text-gray-400"}`}>
      {type}
    </span>
  );
}
