"use client";

import { Alert } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * The provenance disclaimer shown on every EduMatch demo page. Satisfies the
 * acceptance criteria that identities/scenarios are synthetic and that demo
 * bookings/payments create no external side effects.
 */
export function FixtureBanner() {
  const { t } = useTranslation();
  return (
    <Alert tone="info">
      <span dangerouslySetInnerHTML={{ __html: t("showcase.fixtures.edumatch") }} />
    </Alert>
  );
}
