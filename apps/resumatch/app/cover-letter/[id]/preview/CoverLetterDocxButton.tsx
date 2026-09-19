"use client";

import { Button } from "@asafarim/ui";

/** Links to the cover-letter DOCX download route (issue #457) — a plain
 *  navigation, the browser handles the `content-disposition: attachment`
 *  response. Mirrors the tailored-CV preview page's DocxButton. */
export function CoverLetterDocxButton({ id }: { id: string }) {
  return (
    <Button variant="ghost" onClick={() => window.location.assign(`/api/cover-letter/${id}/docx`)}>
      Download DOCX
    </Button>
  );
}
