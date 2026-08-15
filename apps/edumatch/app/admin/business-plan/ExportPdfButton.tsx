"use client";

import { Download } from "lucide-react";

/**
 * Triggers the browser's native print dialog, which every major browser can
 * target at "Save as PDF" (or an actual printer). No server-side rendering
 * pipeline is needed for a page that's mostly text, tables, and a couple of
 * static SVGs — the existing Puppeteer-based PDF pipeline in
 * lib/server/pdf.ts is built for small, templated documents (quotes), not
 * for capturing a live, auth-gated admin page.
 *
 * Print-specific layout (hiding this button, hiding the superadmin-only
 * note) is handled with the `print:hidden` Tailwind variant on those
 * elements directly, rather than a separate stylesheet.
 *
 * `floating` controls positioning: the main business-plan page has a
 * tinted cover box to pin this to the corner of (needs its own
 * `relative`), but sub-pages like the architecture review have no such
 * box, just a plain header row, so the button sits inline there instead.
 */
export function ExportPdfButton({ floating = true }: { floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Export this page as a PDF"
      title="Export as PDF"
      className={`edu-icon-button print:hidden shrink-0 ${floating ? "absolute right-4 top-4 sm:right-6 sm:top-6" : ""}`}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
