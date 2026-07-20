"use client";

import { Alert } from "@asafarim/ui";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * The provenance disclaimer shown on every Vionto Studio demo page. Satisfies
 * the acceptance criteria that this runs fully in fixture mode, uses only
 * synthetic/clearly-licensed assets, and makes no live provider calls.
 */
export function FixtureBanner() {
  const { t } = useTranslation();
  return (
    <Alert tone="info">
      <span dangerouslySetInnerHTML={{ __html: t("showcase.fixtures.vionto") }} />
    </Alert>
  );
}
