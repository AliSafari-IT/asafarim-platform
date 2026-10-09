"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { Alert } from "@asafarim/ui";

const CONTACT = "mailto:asafarim@gmail.com?subject=ResuMatch%20showcase%20%E2%80%94%20building%20something%20similar";

/**
 * The single source of the showcase disclosure required by JM-001 / issue
 * #205. It must appear before or at the point a visitor uploads a CV, so it
 * is rendered on the landing page and again directly above the upload
 * control on the profile page. `variant="compact"` is the short form shown
 * at the upload point itself, where the full text has already been seen.
 *
 * The licensing decision this notice implements is recorded in
 * internal docs: ventures/resumatch/strategy/licensing-commercial-notes.md. The English text is the reference
 * wording; the NL/FR/DE versions in lib/i18n/profile.ts translate it.
 * A client component only for `useTranslation()`.
 */
export function ShowcaseNotice({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { t } = useTranslation();
  if (variant === "compact") {
    return (
      <Alert tone="warning">
        <strong>{t("resumatch.showcase.compact.strong")}</strong> {t("resumatch.showcase.compact.body")}
      </Alert>
    );
  }

  return (
    <Alert tone="warning">
      <strong>{t("resumatch.showcase.full.strong")}</strong> {t("resumatch.showcase.full.body")}{" "}
      <a href={CONTACT} className="jm-mono">
        {t("resumatch.showcase.full.contact")}
      </a>
    </Alert>
  );
}
