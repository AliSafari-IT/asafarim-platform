"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import { useSkillsPending } from "../../../../components/tailoring/SkillsPending";

/** Links to the DOCX download route (issue #435) — a plain navigation, the
 *  browser handles the `content-disposition: attachment` response. Waits
 *  while the Skills section is being changed, so the file never holds the
 *  layout that is about to be replaced. */
export function DocxButton({ id }: { id: string }) {
  const { t } = useTranslation();
  const { pending } = useSkillsPending();
  return (
    <Button
      variant="ghost"
      disabled={pending !== null}
      aria-describedby={pending ? "cv-skills-status" : undefined}
      onClick={() => window.location.assign(`/api/tailor/${id}/docx`)}
    >
      {t("resumatch.preview.downloadDocx")}
    </Button>
  );
}
