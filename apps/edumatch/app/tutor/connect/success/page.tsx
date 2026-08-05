"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

export default function ConnectSuccessPage() {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<{ payoutEnabled: boolean } | null>(null);

  useEffect(() => {
    // Poll the API to check if onboarding is complete
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/tutors/connect/onboard");
        const data = await res.json();
        setStatus(data);
      } catch {
        // ignore
      } finally {
        setChecking(false);
      }
    };

    checkStatus();
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">
          {t("edumatch.connect.successTitle")}
        </h1>
        <p className="text-green-700 mb-6">
          {checking
            ? "Checking your account status..."
            : status?.payoutEnabled
            ? "Your account is fully verified and ready to receive payments."
            : "Your account has been created. Verification may take a few minutes to complete."}
        </p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/tutor"
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition"
          >
            {t("edumatch.hero.cta.dashboard")}
          </Link>
          {!status?.payoutEnabled && !checking && (
            <Link
              href="/tutor/connect/onboard"
              className="rounded-lg border border-green-300 px-6 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition"
            >
              {t("edumatch.connect.checkStatus")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
