"use client";

import { Alert } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * Provenance disclaimer on every AI-Eval page. Covers the issue's constraints:
 * synthetic data, provider-neutral aliases, no employer/customer IP, and no
 * live inference — latency/cost are representative fixtures, not live numbers.
 */
export function FixtureBanner() {
  const { t } = useTranslation();
  return (
    <Alert tone="info">
      <span dangerouslySetInnerHTML={{ __html: t("showcase.fixtures.aiEval") }} />
    </Alert>
  );
}
