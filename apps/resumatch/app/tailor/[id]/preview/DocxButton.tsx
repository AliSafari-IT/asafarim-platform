"use client";

import { Button } from "@asafarim/ui";

/** Links to the DOCX download route (issue #435) — a plain navigation, the
 *  browser handles the `content-disposition: attachment` response. */
export function DocxButton({ id }: { id: string }) {
  return (
    <Button variant="ghost" onClick={() => window.location.assign(`/api/tailor/${id}/docx`)}>
      Download DOCX
    </Button>
  );
}
