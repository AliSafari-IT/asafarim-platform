/** Longest error text an attachment row will render before eliding. */
export const MAX_ERROR_CHARS = 120;

/**
 * Decide what an attachment row should say when an upload fails.
 *
 * Returns `null` when the caller should fall back to the generic localized
 * message, and a string when the server's own text is worth showing.
 *
 * The split is by status class, not by parsing the message:
 *
 * - 4xx is the user's to fix — "file too large", "unsupported type" — so the
 *   server's text is the useful text, and it is already written for humans.
 * - 5xx is never user-actionable. In development `serverError` attaches the
 *   raw exception, which for a database failure is a multi-line dump whose
 *   *first* line is a bundler chunk identifier, not the cause. Summarising it
 *   yields noise that looks like a user error; the generic message plus a
 *   full console entry is both calmer and more useful.
 *
 * Full detail always goes to the console regardless — see AttachmentUploader.
 */
export function uploadErrorMessage(
  detail: string | undefined,
  status: number,
): string | null {
  if (status >= 500 || !detail) return null;

  const firstLine = detail.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (!firstLine) return null;

  return firstLine.length > MAX_ERROR_CHARS
    ? `${firstLine.slice(0, MAX_ERROR_CHARS).trimEnd()}…`
    : firstLine;
}
