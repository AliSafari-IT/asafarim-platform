import { z, ZodError } from "zod";
import { type CandidateProfileContent, ProtectedAttributeError, parseProfileContent } from "./contract";

/**
 * Profile import from a ResuMatch export (#942).
 *
 * "Download everything" (lib/profile/dataRights.ts) writes a versioned
 * archive: every profile version, jobs, tailored CVs, sent emails, evidence
 * and audit events. Before #942 that file went through the CV upload as
 * plain text and the AI extractor read the whole archive as if it were a
 * CV, mixing 21 historical profiles with job adverts. The result looked
 * like a success and was mostly wrong.
 *
 * This module is the deterministic path instead. It is pure (no database,
 * no AI) so the selection and the fidelity report can be tested on their
 * own:
 *
 * - The archive is recognised by its `format` marker, before any generic
 *   CV handling, and its `formatVersion` must be a 1.x we understand.
 * - Only the profile is imported, and only ONE version of it: the one the
 *   export names as confirmed (`profile.confirmedVersionId`), found by id,
 *   never by array position. With no valid confirmed version, nothing is
 *   picked for the candidate: they choose a version, or get an error.
 * - That version's content goes through the same contract parser as every
 *   other write (`parseProfileContent`), so list order, dates, skill
 *   groups, links, languages and preferences come over exactly as stored.
 * - Nothing else from the archive becomes live state: not the source
 *   workspace id, not its confirmation state, not jobs, CVs, emails,
 *   evidence or audit events. The preview lists what is left out.
 */

export const NATIVE_EXPORT_FORMAT = "resumatch-candidate-export";
/** Export format versions this importer reads (major 1). */
const SUPPORTED_FORMAT_VERSION = /^1\.\d+\.\d+$/;
/** An export also carries job texts and sent emails, so it can be larger
 *  than a CV. Still bounded: it is parsed in the request. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
/** Recorded on the imported version so its lineage says where it came from. */
export const IMPORT_EXTRACTOR_NAME = "resumatch-export-import";
export const IMPORT_EXTRACTOR_VERSION = "1.0.0";
/** Far above any real profile history; a guard against a crafted file. */
export const MAX_IMPORT_VERSIONS = 2000;

export type ImportErrorCode =
  | "NOT_NATIVE_EXPORT"
  | "FILE_TOO_LARGE"
  | "INVALID_JSON"
  | "UNSUPPORTED_FORMAT_VERSION"
  | "MALFORMED_EXPORT"
  | "NO_PROFILE"
  | "TOO_MANY_VERSIONS"
  | "VERSION_NOT_FOUND"
  | "NO_CONFIRMED_VERSION"
  | "INVALID_PROFILE_CONTENT";

/** The profile lists the preview counts, in the order it shows them. */
export const IMPORT_SECTIONS = ["experience", "skills", "education", "certifications", "languages", "links"] as const;
export type ImportSection = (typeof IMPORT_SECTIONS)[number];

/** Archive parts that are never imported, in the order the preview lists them. */
export const EXCLUDED_PARTS = [
  "otherVersions",
  "documents",
  "targetJobs",
  "tailoredResumes",
  "sentApplicationEmails",
  "evidence",
  "contactPreferences",
  "profilePhoto",
  "auditEvents",
] as const;
export type ExcludedPart = (typeof EXCLUDED_PARTS)[number];

export interface ImportVersionChoice {
  id: string;
  versionNumber: number;
  createdAt: string | null;
  origin: string | null;
  /** Whether the export marked this version as confirmed. */
  confirmed: boolean;
}

export interface ProfileImportPreview {
  formatVersion: string;
  exportedAt: string | null;
  /** The version that will be imported. */
  source: ImportVersionChoice;
  /** True when it was the export's confirmed version, false when the
   *  candidate picked another one. */
  usedConfirmedVersion: boolean;
  /** Entries in the exported version, and entries that will be restored. */
  counts: Record<ImportSection, { inExport: number; imported: number }>;
  /** Which single fields carry a value after import. */
  fields: { fullName: boolean; email: boolean; phone: boolean; headline: boolean; summary: boolean; baseLocation: boolean; workAuthorization: boolean; preferences: boolean };
  /** Parts of the archive left out, with how many items each held. */
  excluded: { part: ExcludedPart; count: number }[];
  /** Every version in the export, newest first, for an explicit choice. */
  versions: ImportVersionChoice[];
}

export type ProfileImportResult =
  | { ok: true; content: CandidateProfileContent; preview: ProfileImportPreview }
  | {
      ok: false;
      code: ImportErrorCode;
      /** For INVALID_PROFILE_CONTENT: the first field path that failed. */
      field?: string;
      /** For NO_CONFIRMED_VERSION / VERSION_NOT_FOUND: what can be chosen. */
      versions?: ImportVersionChoice[];
    };

const isoOrNull = z.string().max(64).nullable().optional();

/** Only the parts the importer reads are checked strictly; everything else
 *  is counted for the preview and otherwise ignored. */
const archiveSchema = z.object({
  format: z.literal(NATIVE_EXPORT_FORMAT),
  formatVersion: z.string().max(32),
  exportedAt: isoOrNull,
  profile: z
    .object({
      confirmedVersionId: z.string().max(64).nullable().optional(),
      versions: z.array(
        z.object({
          id: z.string().min(1).max(64),
          versionNumber: z.number().int().min(0),
          origin: z.string().max(32).nullable().optional(),
          createdAt: isoOrNull,
          content: z.unknown(),
        }),
      ),
    })
    .nullable()
    .optional(),
});

const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : value ? 1 : 0);

/**
 * Whether these bytes are a ResuMatch export. Cheap and conservative: a
 * JSON object whose `format` is the export marker. Used by the CV upload
 * to send the archive away from generic extraction, so it must never call
 * an ordinary CV an export.
 */
export function isNativeExport(bytes: Uint8Array): boolean {
  const text = decode(bytes);
  if (text === null) return false;
  const start = text.trimStart();
  if (!start.startsWith("{") || !start.includes(NATIVE_EXPORT_FORMAT)) return false;
  try {
    const parsed: unknown = JSON.parse(start);
    return typeof parsed === "object" && parsed !== null && (parsed as { format?: unknown }).format === NATIVE_EXPORT_FORMAT;
  } catch {
    return false;
  }
}

function decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Read an export and pick the profile version to import.
 *
 * `selectedVersionId` is the candidate's explicit choice; without it, the
 * export's confirmed version is used, and with no valid confirmed version
 * the answer is NO_CONFIRMED_VERSION plus the versions to choose from.
 */
export function readProfileExport(bytes: Uint8Array, selectedVersionId?: string | null): ProfileImportResult {
  if (bytes.length > MAX_IMPORT_BYTES) return { ok: false, code: "FILE_TOO_LARGE" };
  const text = decode(bytes);
  if (text === null) return { ok: false, code: "NOT_NATIVE_EXPORT" };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "INVALID_JSON" };
  }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== NATIVE_EXPORT_FORMAT) {
    return { ok: false, code: "NOT_NATIVE_EXPORT" };
  }
  const formatVersion = (raw as { formatVersion?: unknown }).formatVersion;
  if (typeof formatVersion !== "string" || !SUPPORTED_FORMAT_VERSION.test(formatVersion)) {
    return { ok: false, code: "UNSUPPORTED_FORMAT_VERSION" };
  }
  const rawVersions = (raw as { profile?: { versions?: unknown } }).profile?.versions;
  if (Array.isArray(rawVersions) && rawVersions.length > MAX_IMPORT_VERSIONS) {
    return { ok: false, code: "TOO_MANY_VERSIONS" };
  }

  const archive = archiveSchema.safeParse(raw);
  if (!archive.success) return { ok: false, code: "MALFORMED_EXPORT" };
  const { profile } = archive.data;
  if (!profile || profile.versions.length === 0) return { ok: false, code: "NO_PROFILE" };

  const confirmedId = profile.confirmedVersionId ?? null;
  const choices: ImportVersionChoice[] = [...profile.versions]
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      createdAt: v.createdAt ?? null,
      origin: v.origin ?? null,
      confirmed: v.id === confirmedId,
    }));

  const wantedId = selectedVersionId || confirmedId;
  if (!wantedId) return { ok: false, code: "NO_CONFIRMED_VERSION", versions: choices };
  const version = profile.versions.find((v) => v.id === wantedId);
  if (!version) {
    // A dangling confirmed pointer is the same situation as none at all:
    // never fall back to the newest or first version silently.
    return { ok: false, code: selectedVersionId ? "VERSION_NOT_FOUND" : "NO_CONFIRMED_VERSION", versions: choices };
  }

  let content: CandidateProfileContent;
  try {
    content = parseProfileContent(version.content);
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, code: "INVALID_PROFILE_CONTENT", field: error.issues[0]?.path.join(".") || "profile" };
    }
    if (error instanceof ProtectedAttributeError) return { ok: false, code: "INVALID_PROFILE_CONTENT", field: error.keys[0] };
    return { ok: false, code: "INVALID_PROFILE_CONTENT", field: "profile" };
  }

  const rawContent = (version.content ?? {}) as Record<string, unknown>;
  const counts = Object.fromEntries(
    IMPORT_SECTIONS.map((section) => [section, { inExport: countOf(rawContent[section]), imported: content[section].length }]),
  ) as ProfileImportPreview["counts"];

  const r = raw as Record<string, unknown>;
  const excludedCounts: Record<ExcludedPart, number> = {
    otherVersions: profile.versions.length - 1,
    documents: countOf(r.documents),
    targetJobs: countOf(r.targetJobs),
    tailoredResumes: countOf(r.tailoredResumes),
    sentApplicationEmails: countOf(r.sentApplicationEmails),
    evidence: countOf(r.evidence),
    contactPreferences: countOf(r.contactPreferences),
    profilePhoto: countOf(r.profilePhoto),
    auditEvents: countOf(r.auditEvents),
  };

  const p = content.preferences;
  return {
    ok: true,
    content,
    preview: {
      formatVersion,
      exportedAt: archive.data.exportedAt ?? null,
      source: choices.find((c) => c.id === version.id)!,
      usedConfirmedVersion: version.id === confirmedId,
      counts,
      fields: {
        fullName: content.fullName !== null,
        email: content.email !== null,
        phone: content.phone !== null,
        headline: content.headline !== null,
        summary: content.summary !== null,
        baseLocation: content.baseLocation !== null,
        workAuthorization: content.workAuthorization !== null,
        preferences:
          p.locations.length > 0 || p.remote !== null || p.contractTypes.length > 0 || p.salaryFloor !== null,
      },
      excluded: EXCLUDED_PARTS.map((part) => ({ part, count: excludedCounts[part] })).filter((e) => e.count > 0),
      versions: choices,
    },
  };
}
