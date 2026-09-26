"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";

/** Links to the DOCX download route (issue #435) — a plain navigation, the
 *  browser handles the `content-disposition: attachment` response. */
export function DocxButton({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" onClick={() => window.location.assign(`/api/tailor/${id}/docx`)}>
      {t("resumatch.preview.downloadDocx")}
    </Button>
  );
}
