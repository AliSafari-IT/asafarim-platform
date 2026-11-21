"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import { useSkillsPending } from "./SkillsPending";

/** Browser print-to-PDF, per the v1 decision: no server-side rendering
 *  dependency, just the browser's own print dialog against the
 *  `@media print` stylesheet in app/resumatch.css. Waits while the CV's
 *  Skills section is being changed (see SkillsPending.tsx). */
export function PrintButton() {
  const { t } = useTranslation();
  const { pending } = useSkillsPending();
  return (
    <Button onClick={() => window.print()} disabled={pending !== null} aria-describedby={pending ? "cv-skills-status" : undefined}>
      {t("resumatch.preview.downloadPdf")}
    </Button>
  );
}
