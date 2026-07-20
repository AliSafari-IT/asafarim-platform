"use client";

import { Alert } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * The provenance disclaimer shown on every Testora demo page. Satisfies the
 * acceptance criterion that results never pretend fixture events are production.
 */
export function FixtureBanner() {
  const { t } = useTranslation();
  return (
    <Alert tone="info">
      <span
        dangerouslySetInnerHTML={{ __html: t("showcase.fixtures.testora") }}
      />
    </Alert>
  );
}
