"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Transaction = {
  id: string;
  type: "CHARGE" | "PAYOUT";
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  action: string;
  createdAt: string;
};

type Wallet = {
  balanceCents: number;
  pendingCents: number;
  lifetimeEarnedCents: number;
};

export default function TutorEarningsPage() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tutors/wallet")
      .then((r) => r.json())
      .then((data: { wallet?: Wallet; transactions?: Transaction[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setWallet(data.wallet ?? null);
        setTransactions(data.transactions ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("edumatch.tutor.earnings.loadFailed"));
        setLoading(false);
      });
  }, []);

  const totalEarned = transactions
    .filter((t) => t.type === "CHARGE")
    .reduce((sum, t) => sum + t.netCents, 0);

  const totalPaidOut = transactions
    .filter((t) => t.type === "PAYOUT")
    .reduce((sum, t) => sum + t.netCents, 0);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/tutor" className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--color-text)]">{t("edumatch.tutor.earnings.title")}</span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.tutor.earnings.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t("edumatch.tutor.earnings.subtitle")}</p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("edumatch.tutor.earnings.available"), value: wallet?.balanceCents ?? 0, color: "text-green-500" },
          { label: t("edumatch.tutor.earnings.pending24"),     value: wallet?.pendingCents ?? 0,  color: "text-amber-500" },
          { label: t("edumatch.tutor.earnings.totalEarned"),      value: totalEarned,                color: "text-[var(--color-text)]" },
          { label: t("edumatch.tutor.earnings.totalPaidOut"),    value: totalPaidOut,               color: "text-[var(--color-text)]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <p className={`text-xl font-bold ${color}`}>€{(value / 100).toFixed(2)}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Transaction history */}
      <h2 className="mb-3 text-base font-semibold text-[var(--color-text)]">{t("edumatch.tutor.earnings.history")}</h2>

      {transactions.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 text-center text-sm text-[var(--color-text-muted)]">
          {t("edumatch.tutor.earnings.empty")}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] overflow-hidden">
          {transactions.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center justify-between px-5 py-4 ${i > 0 ? "border-t border-[var(--color-border)]" : ""}`}
            >
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {t.type === "CHARGE" ? "💰 Session payment" : "🏦 Payout"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {new Date(t.createdAt).toLocaleDateString()}
                  {t.type === "CHARGE" && t.platformFeeCents > 0 && (
                    <span className="ml-2 text-[var(--color-text-muted)]">
                      (fee: €{(t.platformFeeCents / 100).toFixed(2)})
                    </span>
                  )}
                </p>
              </div>
              <p className={`text-sm font-bold ${t.type === "CHARGE" ? "text-green-500" : "text-[var(--color-text-muted)]"}`}>
                {t.type === "CHARGE" ? "+" : "-"}€{(t.netCents / 100).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
