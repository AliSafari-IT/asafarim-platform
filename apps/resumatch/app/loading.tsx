"use client";

import { useTranslation } from "@asafarim/shared-i18n";

/** A client component only for useTranslation(): it renders as a Suspense
 *  fallback, inside the root layout's I18nProvider. */
export default function Loading() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" style={{ padding: "3rem 0", opacity: 0.7 }}>
      <p className="jm-mono">{t("resumatch.loadingApp")}</p>
    </div>
  );
}
