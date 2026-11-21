/**
 * Attachment file names, built the way the browser names a printed PDF from
 * the tab title: "Ali Safari – CV – Kingfisher IT.pdf". Only characters that
 * are safe in every mail client and file system survive; the candidate's
 * name and the employer come from stored data, never from the request.
 */

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

function clean(part: string | null | undefined): string | null {
  if (!part) return null;
  const value = part.replace(UNSAFE, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return value || null;
}

export function pdfFilename(fullName: string | null, documentLabel: string, employer: string | null): string {
  const parts = [clean(fullName), clean(documentLabel) ?? "Document", clean(employer)].filter(Boolean);
  return `${parts.join(" – ")}.pdf`;
}

/** RFC 6266 Content-Disposition with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(filename: string, disposition: "inline" | "attachment"): string {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "document.pdf";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
