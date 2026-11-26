import { FILE_HEADER_LINE, parseSourceFiles, type SourceFile } from "../tailoring/jobFiles";

/**
 * Where a saved job came from (internal docs
 * ventures/resumatch/engineering/job-source.md), read back from what the
 * intake routes already store on `target_jobs`: `sourceUrl` (a real URL
 * for a fetched link, a pseudo-URL such as `pasted://` for every other
 * path), `sourceFiles` (uploads since 0.6.18) and `rawText`.
 *
 * Nothing new is stored. Uploaded files keep their names, types and sizes
 * only: the bytes are never stored, so "view" always means the text
 * ResuMatch read from them.
 */

export type JobSourceKind = "link" | "files" | "pasted" | "email" | "manual" | "unknown";

/** A file name; type and size are null for uploads from before 0.6.18,
 *  which kept only the first name in `sourceUrl`. */
export interface JobSourceFile {
  name: string;
  contentType: string | null;
  bytes: number | null;
}

export interface JobSourceView {
  kind: JobSourceKind;
  /** The job's web address, only for a fetched link (http/https). */
  url: string | null;
  /** The URL's host without `www.`, for the short label. */
  host: string | null;
  files: JobSourceFile[];
  /** More files than `files` lists (a pre-0.6.18 multi-file upload
   *  recorded as `upload://first (+2 more)`). */
  moreFiles: number;
}

export interface JobSourceInput {
  sourceUrl: string;
  sourceFiles?: unknown;
}

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const LEGACY_MORE = /^(.*) \(\+(\d+) more\)$/;

function legacyUploadFiles(rest: string): { files: JobSourceFile[]; moreFiles: number } {
  const match = LEGACY_MORE.exec(rest);
  const name = (match ? match[1] : rest).trim();
  const files = name && name !== "job-description" ? [{ name, contentType: null, bytes: null }] : [];
  return { files, moreFiles: match ? Number(match[2]) : 0 };
}

export function describeJobSource(job: JobSourceInput): JobSourceView {
  const none = { url: null, host: null, files: [], moreFiles: 0 };
  const source = job.sourceUrl.trim();
  const url = httpUrl(source);
  if (url) return { ...none, kind: "link", url: url.toString(), host: url.hostname.replace(/^www\./i, "") };

  const scheme = /^([a-z]+):\/\//i.exec(source)?.[1]?.toLowerCase();
  if (scheme === "upload") {
    const stored: SourceFile[] | null = parseSourceFiles(job.sourceFiles);
    if (stored) {
      return {
        ...none,
        kind: "files",
        files: stored.map((f) => ({ name: f.name, contentType: f.contentType, bytes: f.bytes })),
      };
    }
    return { ...none, kind: "files", ...legacyUploadFiles(source.slice("upload://".length)) };
  }
  if (scheme === "pasted") return { ...none, kind: "pasted" };
  if (scheme === "email") return { ...none, kind: "email" };
  if (scheme === "manual") return { ...none, kind: "manual" };
  return { ...none, kind: "unknown" };
}

/** One readable block of the saved job text. Uploads from several files
 *  carry a `=== File n of N: name ===` header above each file's text
 *  (combineJobFileTexts); they become one section per file. */
export interface JobTextSection {
  file: string | null;
  text: string;
}

const HEADER_NAME = /^=== File \d+ of \d+: (.*) ===$/;

export function splitJobText(text: string): JobTextSection[] {
  if (!text.startsWith("=== File ")) return text.trim() ? [{ file: null, text: text.trim() }] : [];
  const sections: JobTextSection[] = [];
  let current: { file: string | null; lines: string[] } | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (FILE_HEADER_LINE.test(trimmed)) {
      if (current) sections.push({ file: current.file, text: current.lines.join("\n").trim() });
      current = { file: HEADER_NAME.exec(trimmed)?.[1] ?? null, lines: [] };
      continue;
    }
    if (!current) current = { file: null, lines: [] };
    current.lines.push(line);
  }
  if (current) sections.push({ file: current.file, text: current.lines.join("\n").trim() });
  return sections.filter((s) => s.text || s.file);
}

/** "12 KB", "1.4 MB": sizes for the file list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A short type label from the sniffed content type. */
export function fileTypeLabel(contentType: string | null, name: string): string | null {
  const byType: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/msword": "DOC",
    "text/plain": "TXT",
    "text/markdown": "MD",
    "text/csv": "CSV",
    "application/json": "JSON",
    "text/html": "HTML",
    "application/rtf": "RTF",
    "application/vnd.oasis.opendocument.text": "ODT",
  };
  if (contentType && byType[contentType]) return byType[contentType];
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1];
  return ext ? ext.toUpperCase() : null;
}

/** Where the "Back" link on the job page goes: only the two lists that
 *  link to it, never an arbitrary value from the URL. */
export type JobPageFrom = "applications" | "history";
export function jobPageFrom(value: unknown): JobPageFrom | null {
  return value === "applications" || value === "history" ? value : null;
}

export function jobPageHref(targetJobId: string, from: JobPageFrom): string {
  return `/jobs/${encodeURIComponent(targetJobId)}?from=${from}`;
}
