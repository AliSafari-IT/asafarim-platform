import { z } from "zod";

/**
 * One job from several uploaded files (Tailor's "Upload files"): a
 * recruiter often sends the posting as two or three attachments (the
 * vacancy, a company profile, a benefits sheet). Up to MAX_JOB_FILES of
 * them are read one by one, with the same byte sniffing, scan and
 * killable parse worker as a single file, and their text is joined into
 * the one `TargetJob.rawText` the rest of Tailor already reads.
 *
 * Client-safe: no server imports. The Tailor page checks a selection with
 * the same limits the route enforces, so a candidate sees "too many" or
 * "too large" before anything is sent.
 */

export const MAX_JOB_FILES = 5;

/** Each file keeps the CV upload's own 10 MB cap (MAX_DOCUMENT_BYTES). */
export const MAX_JOB_FILE_BYTES = 10 * 1024 * 1024;

/** All files together. Stays below the 22 MB request-body limit in
 *  next.config.ts (proxyClientMaxBodySize), which leaves room for the
 *  multipart framing. */
export const MAX_JOB_FILES_TOTAL_BYTES = 20 * 1024 * 1024;

/**
 * What the file picker offers. JSON and Markdown are plain text to the
 * byte sniffer (lib/documents/fileType.ts), so they are read exactly like
 * a .txt; the sniffer, not this list, decides what is accepted.
 */
export const JOB_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
].join(",");

/** The files a job was read from, kept on the job (`target_jobs.sourceFiles`)
 *  so a resumed draft still shows which files it came from. */
export const sourceFileSchema = z
  .object({
    name: z.string().min(1).max(200),
    /** The sniffed type, never the browser's. */
    contentType: z.string().min(1).max(120),
    bytes: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
  })
  .strict();

export type SourceFile = z.infer<typeof sourceFileSchema>;

/** Stored value read back; anything that no longer validates reads as none. */
export function parseSourceFiles(value: unknown): SourceFile[] | null {
  const parsed = z.array(sourceFileSchema).max(MAX_JOB_FILES).safeParse(value);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/** Why a file the candidate picked can't be sent, checked in the browser. */
export type SelectionProblem = "TOO_MANY_FILES" | "FILE_TOO_LARGE" | "TOTAL_TOO_LARGE" | "EMPTY_FILE";

export interface SelectionCheck {
  /** Per file, in the order given: null when that file is fine. */
  perFile: ("FILE_TOO_LARGE" | "EMPTY_FILE" | null)[];
  /** A problem with the set as a whole. */
  overall: "TOO_MANY_FILES" | "TOTAL_TOO_LARGE" | null;
  totalBytes: number;
  ok: boolean;
}

export function checkSelection(files: readonly { size: number }[]): SelectionCheck {
  const perFile = files.map((file) =>
    file.size === 0 ? ("EMPTY_FILE" as const) : file.size > MAX_JOB_FILE_BYTES ? ("FILE_TOO_LARGE" as const) : null,
  );
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const overall =
    files.length > MAX_JOB_FILES ? ("TOO_MANY_FILES" as const) : totalBytes > MAX_JOB_FILES_TOTAL_BYTES ? ("TOTAL_TOO_LARGE" as const) : null;
  return { perFile, overall, totalBytes, ok: files.length > 0 && overall === null && perFile.every((p) => p === null) };
}

/** Same file picked twice: same name and size. (Not the modification
 *  time: a file dragged from a mail client gets a fresh one each time.) */
export function fileKey(file: { name: string; size: number }): string {
  return `${file.name}\u0000${file.size}`;
}

/** Adds newly picked files after the ones already listed, skipping repeats.
 *  Never trims to MAX_JOB_FILES: an over-full list is shown with its
 *  "too many" message so the candidate chooses what to remove. */
export function addFiles<T extends { name: string; size: number }>(current: readonly T[], picked: readonly T[]): T[] {
  const seen = new Set(current.map(fileKey));
  const next = [...current];
  for (const file of picked) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

/** The header line `combineJobFileTexts` puts above each file's text. */
export const FILE_HEADER_LINE = /^=== File \d+ of \d+: .* ===$/;

/** The text with the file headers blanked out, for the deterministic
 *  checks (job fit, CV coverage): a file name is not posting content. */
export function withoutFileHeaders(text: string): string {
  if (!text.startsWith("=== File ")) return text;
  return text
    .split("\n")
    .map((line) => (FILE_HEADER_LINE.test(line.trim()) ? "" : line))
    .join("\n");
}

/** Characters the headers and separators of `count` files take, at most:
 *  the route refuses a set whose text would not fit under the cap. */
export function joinedLength(parts: readonly { name: string; text: string }[]): number {
  if (parts.length === 1) return parts[0].text.length;
  const total = parts.length;
  return parts.reduce(
    (sum, part, index) => sum + `=== File ${index + 1} of ${total}: ${part.name} ===\n`.length + part.text.trim().length + 2,
    0,
  );
}

/**
 * The job text from each file's text, in upload order. A single file is
 * stored exactly as before; several are each headed by their name so the
 * AI (and the candidate reading the snippet) can tell them apart.
 * `maxCharacters` caps the result like one extraction is capped.
 */
export function combineJobFileTexts(parts: readonly { name: string; text: string }[], maxCharacters: number): string {
  if (parts.length === 1) return parts[0].text.slice(0, maxCharacters);
  const total = parts.length;
  return parts
    .map((part, index) => `=== File ${index + 1} of ${total}: ${part.name} ===\n${part.text.trim()}`)
    .join("\n\n")
    .slice(0, maxCharacters);
}

/** `upload://<name>` as before for one file; the first name and a count
 *  for several (the full list is in `sourceFiles`). */
export function uploadSourceUrl(names: readonly string[]): string {
  if (names.length <= 1) return `upload://${names[0] ?? "job-description"}`;
  return `upload://${names[0]} (+${names.length - 1} more)`;
}
