"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { ContextualHelpLink } from "@/components/help/ContextualHelpLink";

export default function ConnectOnboardPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [status, setStatus] = useState<{
    hasAccount: boolean;
    payoutEnabled: boolean;
    stripeAccountId?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tutors/connect/onboard")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setError(t("edumatch.connect.loadFailed"));
        setLoading(false);
      });
  }, []);

  async function startOnboarding() {
    setOnboarding(true);
    setError(null);

    try {
      const res = await fetch("/api/tutors/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json() as { url?: string; error?: string; alreadyOnboarded?: boolean };

      if (!res.ok) {
        setError(data.error ?? t("edumatch.connect.startFailed"));
        setOnboarding(false);
        return;
      }

      if (data.alreadyOnboarded) {
        setStatus((s) => (s ? { ...s, hasAccount: true } : null));
        setOnboarding(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError(t("edumatch.inquiry.new.networkError"));
      setOnboarding(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex h-[40vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)]"></div>
        </div>
      </div>
    );
  }

  const isComplete = status?.hasAccount && status?.payoutEnabled;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link href="/tutor" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {t("edumatch.inquiry.detail.backToDashboard")}
        </Link>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.connect.title")}</h1>
        <ContextualHelpLink href="/help/tutors/payments-and-settings" />
      </div>
      <p className="text-[var(--color-text-muted)] mb-6">
        {t("edumatch.connect.subtitle")}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
        {/* Step 1: Create Account */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${status?.hasAccount ? "bg-green-500 text-white" : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>
            {status?.hasAccount ? "✓" : "1"}
          </div>
          <div>
            <h3 className="font-medium text-[var(--color-text)]">{t("edumatch.connect.createAccount")}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              {status?.hasAccount
                ? t("edumatch.connect.accountCreated")
                : t("edumatch.connect.createAccountDesc")}
            </p>
          </div>
        </div>

        {/* Step 2: Complete Onboarding */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${status?.payoutEnabled ? "bg-green-500 text-white" : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>
            {status?.payoutEnabled ? "✓" : "2"}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-[var(--color-text)]">{t("edumatch.connect.verifyIdentity")}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              {status?.payoutEnabled
                ? t("edumatch.connect.verifiedDesc")
                : t("edumatch.connect.verifyDesc")}
            </p>
            {!status?.payoutEnabled && status?.hasAccount && (
              <button
                onClick={startOnboarding}
                disabled={onboarding}
                className="mt-3 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {onboarding ? t("common.loading") : t("edumatch.connect.completeVerification")}
              </button>
            )}
          </div>
        </div>

        {/* Step 3: Ready */}
        <div className="flex items-start gap-4">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isComplete ? "bg-green-500 text-white" : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>
            {isComplete ? "✓" : "3"}
          </div>
          <div>
            <h3 className="font-medium text-[var(--color-text)]">{t("edumatch.connect.readyTitle")}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              {isComplete
                ? t("edumatch.connect.readyDesc")
                : t("edumatch.connect.readyPendingDesc")}
            </p>
          </div>
        </div>

        {/* Action Button */}
        {!status?.hasAccount && (
          <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
            <button
              onClick={startOnboarding}
              disabled={onboarding}
              className="w-full rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {onboarding ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("edumatch.connect.connecting")}
                </>
              ) : (
                t("edumatch.connect.connectButton")
              )}
            </button>
            <p className="mt-3 text-xs text-center text-[var(--color-text-muted)]">
              {t("edumatch.connect.redirectNote")}
            </p>
          </div>
        )}

        {isComplete && (
          <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
            <Link
              href="/tutor"
              className="block w-full text-center rounded-lg bg-green-500 px-6 py-3 text-sm font-medium text-white hover:bg-green-600 transition"
            >
              {t("edumatch.hero.cta.dashboard")}
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
        <strong>{t("edumatch.connect.whyTitle")}</strong>
        <p className="mt-1">
          {t("edumatch.connect.whyDesc")}
        </p>
      </div>
    </div>
  );
}
