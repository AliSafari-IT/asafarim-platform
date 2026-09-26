"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";

/** Browser print-to-PDF, per the v1 decision: no server-side rendering
 *  dependency, just the browser's own print dialog against the
 *  `@media print` stylesheet in app/resumatch.css. */
export function PrintButton() {
  const { t } = useTranslation();
  return <Button onClick={() => window.print()}>{t("resumatch.preview.downloadPdf")}</Button>;
}
