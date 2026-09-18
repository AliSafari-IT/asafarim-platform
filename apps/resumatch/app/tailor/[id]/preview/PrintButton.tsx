"use client";

import { Button } from "@asafarim/ui";

/** Browser print-to-PDF, per the v1 decision: no server-side rendering
 *  dependency, just the browser's own print dialog against the
 *  `@media print` stylesheet in app/resumatch.css. */
export function PrintButton() {
  return <Button onClick={() => window.print()}>Download PDF</Button>;
}
