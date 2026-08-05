"use client";

import { useEffect } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

export default function ConnectRefreshPage() {
  const { t } = useTranslation();
  useEffect(() => {
    // Redirect back to onboarding page to restart the flow
    window.location.href = "/tutor/connect/onboard";
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--color-primary)] mx-auto mb-4"></div>
          <p className="text-[var(--color-text-muted)]">{t("edumatch.connect.redirecting")}</p>
        </div>
      </div>
    </div>
  );
}
