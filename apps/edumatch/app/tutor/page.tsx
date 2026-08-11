"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Wallet = {
  balanceCents: number;
  pendingCents: number;
  nextPayoutEligible: boolean;
  nextPayoutAt: string | null;
};

type Transaction = {
  id: string;
  type: "CHARGE" | "PAYOUT";
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  createdAt: string;
};

export default function TutorDashboard() {
  const { t } = useTranslation();
  const { data: session, status } = useSession();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [connectStatus, setConnectStatus] = useState<{
    hasAccount: boolean;
    payoutEnabled: boolean;
  } | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/tutors/wallet")
          .then((r) => r.json())
          .catch(() => ({ wallet: null, transactions: [] })),
        fetch("/api/tutor/profile")
          .then((r) => ({ ok: r.ok }))
          .catch(() => ({ ok: false })),
        fetch("/api/tutors/connect/onboard")
          .then((r) => r.json())
          .catch(() => ({ hasAccount: false, payoutEnabled: false })),
      ]).then(([walletData, profileData, connectData]) => {
        setWallet(walletData.wallet);
        setTransactions(walletData.transactions ?? []);
        setHasProfile((profileData as { ok: boolean }).ok);
        setConnectStatus(
          connectData as { hasAccount: boolean; payoutEnabled: boolean },
        );
        setLoading(false);
      });
    }
  }, [status]);

  async function requestPayout() {
    setPayoutLoading(true);
    setPayoutError(null);
    setPayoutSuccess(false);

    try {
      const res = await fetch("/api/tutors/wallet", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setPayoutError(data.error ?? "Payout failed");
        setPayoutLoading(false);
        return;
      }

      setPayoutSuccess(true);
      // Refresh wallet data
      const walletRes = await fetch("/api/tutors/wallet");
      const walletData = await walletRes.json();
      setWallet(walletData.wallet);
      setTransactions(walletData.transactions ?? []);
    } catch {
      setPayoutError("Network error. Please try again.");
    } finally {
      setPayoutLoading(false);
    }
  }

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
            {t("edumatch.tutor.signInRequired")}
          </h1>
          <Link
            href="/api/auth/signin"
            className="text-[var(--color-primary)] hover:underline"
          >
            {t("edumatch.tutor.signIn")}
          </Link>
        </div>
      </div>
    );
  }

  const balance = wallet ? (wallet.balanceCents / 100).toFixed(2) : "0.00";
  const pending = wallet ? (wallet.pendingCents / 100).toFixed(2) : "0.00";

  const showConnectBanner =
    connectStatus &&
    (!connectStatus.hasAccount || !connectStatus.payoutEnabled);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Profile Setup Banner */}
      {hasProfile === false && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <div className="mt-0.5 text-amber-500 text-xl">⚠</div>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              {t("edumatch.tutor.profileMissing.title")}
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {t("edumatch.tutor.profileMissing.desc")}
            </p>
          </div>
          <Link
            href="/tutor/profile"
            className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
          >
            {t("edumatch.tutor.profileMissing.action")}
          </Link>
        </div>
      )}

      {/* Stripe Connect Banner */}
      {showConnectBanner && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-blue-300 bg-blue-50 px-5 py-4">
          <div className="mt-0.5 text-blue-500 text-xl">💳</div>
          <div className="flex-1">
            <p className="font-semibold text-blue-800">
              {!connectStatus?.hasAccount
                ? t("edumatch.tutor.stripe.connectTitle")
                : t("edumatch.tutor.stripe.verifyTitle")}
            </p>
            <p className="text-sm text-blue-700 mt-0.5">
              {!connectStatus?.hasAccount
                ? t("edumatch.tutor.stripe.connectDesc")
                : t("edumatch.tutor.stripe.verifyDesc")}
            </p>
          </div>
          <Link
            href="/tutor/connect/onboard"
            className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition"
          >
            {!connectStatus?.hasAccount
              ? t("edumatch.tutor.stripe.connectAction")
              : t("edumatch.tutor.stripe.completeAction")}
          </Link>
        </div>
      )}

      {/* Payout Messages */}
      {payoutError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
          {payoutError}
        </div>
      )}
      {payoutSuccess && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-700">
          {t("edumatch.tutor.payout.success")}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[var(--color-text)]">
          {t("edumatch.tutor.dashboard.title")}
        </h2>
        <p className="text-[var(--color-text-muted)]">
          {t("edumatch.tutor.dashboard.subtitle")}
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h3 className="mb-1 text-sm font-medium text-[var(--color-text-muted)]">
            {t("edumatch.dashboard.balance")}
          </h3>
          <p className="text-3xl font-bold text-green-500">€{balance}</p>
          {wallet?.nextPayoutEligible && connectStatus?.payoutEnabled && (
            <button
              onClick={requestPayout}
              disabled={payoutLoading}
              className="mt-3 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
            >
              {payoutLoading
                ? t("edumatch.tutor.balance.processing")
                : t("edumatch.tutor.balance.requestPayout")}
            </button>
          )}
          {wallet && !wallet.nextPayoutEligible && wallet.nextPayoutAt && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t("edumatch.tutor.balance.nextPayout", {
                date: new Date(wallet.nextPayoutAt).toLocaleDateString(),
              })}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h3 className="mb-1 text-sm font-medium text-[var(--color-text-muted)]">
            {t("edumatch.dashboard.pending")}
          </h3>
          <p className="text-3xl font-bold text-yellow-500">€{pending}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.tutor.balance.pendingNote")}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h3 className="mb-1 text-sm font-medium text-[var(--color-text-muted)]">
            {t("edumatch.dashboard.requests")}
          </h3>
          <p className="text-3xl font-bold text-[var(--color-primary)]">0</p>
          <Link
            href="/tutor/requests"
            className="mt-1 inline-block text-sm text-[var(--color-primary)] hover:underline"
          >
            {t("edumatch.tutor.quoteRequests.view")}
          </Link>
        </div>
      </div>

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--color-text)]">
            {t("edumatch.tutor.transactions.title")}
          </h2>
          <div className="space-y-2">
            {transactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <div>
                  <p className="font-medium text-[var(--color-text)]">
                    {tx.type === "CHARGE"
                      ? t("edumatch.tutor.transactions.sessionPayment")
                      : t("edumatch.tutor.transactions.payout")}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${tx.type === "CHARGE" ? "text-green-600" : "text-blue-600"}`}
                  >
                    {tx.type === "CHARGE" ? "+" : "-"}€
                    {(Math.abs(tx.netCents) / 100).toFixed(2)}
                  </p>
                  {tx.type === "CHARGE" && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t("edumatch.tutor.transactions.fee")} €
                      {(tx.platformFeeCents / 100).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text)]">
          {t("edumatch.dashboard.actions")}
        </h2>
        <div className="flex gap-3">
          <Link
            href="/tutor/connect/onboard"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              connectStatus?.payoutEnabled
                ? "border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                : "bg-[var(--color-primary)] text-[#07101a] hover:opacity-90"
            }`}
          >
            {connectStatus?.payoutEnabled
              ? t("edumatch.tutor.quickActions.stripeConnected")
              : t("edumatch.tutor.quickActions.setupStripe")}
          </Link>
          <Link
            href="/tutor/profile"
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)]"
          >
            {hasProfile
              ? t("edumatch.tutor.editProfile")
              : t("edumatch.tutor.createProfile")}
          </Link>
        </div>
      </div>
    </div>
  );
}
