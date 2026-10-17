import type { PrismaClient } from "../db/generated";
import { EXTRACT_MODEL_VERSIONS } from "./ai/registry";
import { EXTRACT_PROMPT_VERSION } from "./ai/prompts";
import {
  EXTRACTOR_NAME,
  EXTRACTOR_VERSION,
  PROFILE_EXTRACTOR_NAME,
  PROFILE_EXTRACTOR_VERSION,
} from "./versions";

/**
 * Stale-extractor-version report (issue #523).
 *
 * Every EXTRACTED `CandidateProfileVersion` is stamped by
 * `lib/documents/service.ts` as
 *
 *   extractorName    = "<text layer>+<profile extractor>"
 *   extractorVersion = "<text version>+<profile version>"
 *
 * where the profile half is either the rule-based extractor
 * (`resumatch-rules` / "1.0.0") or the AI path
 * (`resumatch-rules-ai` / "<provider>:<model>:<prompt version>").
 * This module compares those stamps with the constants the code runs today
 * and lists every version produced by older code, with whether its source
 * document can still be read to extract it again.
 *
 * DECISION (v1): re-extraction is OPT-IN ONLY. Nothing here, and nothing
 * else in the app, re-extracts a profile on its own. A candidate may have
 * reviewed, corrected and confirmed what the old extractor produced, and
 * silently replacing it would change data they already signed off on. The
 * report is operator-facing; offering a candidate "re-scan your CV" is a
 * later, separate product step. Revisit when that prompt exists.
 *
 * Read-only, and it never selects profile content, confidence or file
 * names: the report carries ids, version stamps and dates only.
 */

export type StaleReason =
  /** The text layer (`EXTRACTOR_VERSION`) changed since. */
  | "TEXT_EXTRACTOR_VERSION"
  /** The rule-based profile extractor (`PROFILE_EXTRACTOR_VERSION`) changed since. */
  | "PROFILE_RULES_VERSION"
  /** The AI extraction prompt (`EXTRACT_PROMPT_VERSION`) changed since. */
  | "EXTRACT_PROMPT_VERSION"
  /** The provider's configured model (`EXTRACT_MODEL_VERSIONS`) changed since. */
  | "EXTRACT_MODEL_VERSION"
  /** A stamp this code doesn't know how to read. Listed rather than guessed. */
  | "UNRECOGNIZED_EXTRACTOR";

export interface CurrentExtractorVersions {
  textName: string;
  textVersion: string;
  rulesName: string;
  rulesVersion: string;
  aiName: string;
  promptVersion: string;
  modelVersions: Readonly<Record<string, string>>;
}

export function currentExtractorVersions(): CurrentExtractorVersions {
  return {
    textName: EXTRACTOR_NAME,
    textVersion: EXTRACTOR_VERSION,
    rulesName: PROFILE_EXTRACTOR_NAME,
    rulesVersion: PROFILE_EXTRACTOR_VERSION,
    aiName: `${PROFILE_EXTRACTOR_NAME}-ai`,
    promptVersion: EXTRACT_PROMPT_VERSION,
    modelVersions: EXTRACT_MODEL_VERSIONS,
  };
}

export interface ExtractorVersionVerdict {
  stale: boolean;
  reasons: StaleReason[];
}

/** Split on the first "+" only; the AI half never contains one, but a
 *  future model id might, and it belongs to the right-hand side. */
function splitPair(value: string): [string, string] | null {
  const at = value.indexOf("+");
  if (at <= 0 || at === value.length - 1) return null;
  return [value.slice(0, at), value.slice(at + 1)];
}

const UNRECOGNIZED: ExtractorVersionVerdict = { stale: true, reasons: ["UNRECOGNIZED_EXTRACTOR"] };

/**
 * Whether an EXTRACTED version's stamp matches the code running today.
 * Pure: `current` defaults to this build's constants and is injectable so
 * tests can simulate a bump.
 */
export function classifyExtractorVersion(
  extractorName: string,
  extractorVersion: string,
  current: CurrentExtractorVersions = currentExtractorVersions(),
): ExtractorVersionVerdict {
  const names = splitPair(extractorName);
  const versions = splitPair(extractorVersion);
  if (!names || !versions) return UNRECOGNIZED;

  const [textName, profileName] = names;
  const [textVersion, profileVersion] = versions;
  if (textName !== current.textName) return UNRECOGNIZED;

  const reasons: StaleReason[] = [];
  if (textVersion !== current.textVersion) reasons.push("TEXT_EXTRACTOR_VERSION");

  if (profileName === current.rulesName) {
    if (profileVersion !== current.rulesVersion) reasons.push("PROFILE_RULES_VERSION");
  } else if (profileName === current.aiName) {
    // "<provider>:<model>:<prompt>". The model id may itself contain ":"
    // (fine-tuned ids do), so the provider is the first part, the prompt
    // the last, and the model everything in between.
    const parts = profileVersion.split(":");
    if (parts.length < 3) return UNRECOGNIZED;
    const provider = parts[0] ?? "";
    const prompt = parts[parts.length - 1] ?? "";
    const model = parts.slice(1, -1).join(":");
    const currentModel = Object.hasOwn(current.modelVersions, provider)
      ? current.modelVersions[provider]
      : undefined;
    if (currentModel === undefined) return UNRECOGNIZED;
    if (prompt !== current.promptVersion) reasons.push("EXTRACT_PROMPT_VERSION");
    if (model !== currentModel) reasons.push("EXTRACT_MODEL_VERSION");
  } else {
    return UNRECOGNIZED;
  }

  return { stale: reasons.length > 0, reasons };
}

export interface StaleProfileVersion {
  workspaceId: string;
  profileId: string;
  versionId: string;
  versionNumber: number;
  extractorName: string;
  extractorVersion: string;
  reasons: StaleReason[];
  createdAt: Date;
  /** The candidate has confirmed this exact version (matching runs on it). */
  isConfirmed: boolean;
  documentId: string | null;
  /** The source bytes can still be read, so re-extraction is possible. */
  sourceDocumentAvailable: boolean;
}

export interface SourceDocumentState {
  deletedAt: Date | null;
  retainUntil: Date | null;
}

/**
 * Re-extraction needs the original bytes: a version whose document was
 * unlinked (erasure sets `documentId` null), soft-deleted, or is past its
 * retention date can't be re-read, whatever the object store still holds.
 */
export function isSourceDocumentAvailable(
  documentId: string | null,
  document: SourceDocumentState | null,
  now: Date,
): boolean {
  if (!documentId || !document) return false;
  if (document.deletedAt) return false;
  if (document.retainUntil && document.retainUntil.getTime() <= now.getTime()) return false;
  return true;
}

export type StaleVersionsDb = Pick<PrismaClient, "candidateProfileVersion">;

export const STALE_REPORT_BATCH_SIZE = 500;

/**
 * Every EXTRACTED profile version whose stamp is older than (or unknown to)
 * the code running now. CORRECTED and MANUAL versions are the candidate's
 * own words and are never candidates for re-extraction, so they are not
 * read. Walks the table in id order, one batch at a time.
 */
export async function listStaleProfileVersions(
  db: StaleVersionsDb,
  opts: { now?: Date; current?: CurrentExtractorVersions; batchSize?: number } = {},
): Promise<StaleProfileVersion[]> {
  const now = opts.now ?? new Date();
  const current = opts.current ?? currentExtractorVersions();
  const batchSize = opts.batchSize ?? STALE_REPORT_BATCH_SIZE;
  const stale: StaleProfileVersion[] = [];

  let cursor: string | undefined;
  for (;;) {
    const rows = await db.candidateProfileVersion.findMany({
      where: { origin: "EXTRACTED" },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        profileId: true,
        versionNumber: true,
        extractorName: true,
        extractorVersion: true,
        createdAt: true,
        documentId: true,
        profile: { select: { workspaceId: true, confirmedVersionId: true } },
        document: { select: { deletedAt: true, retainUntil: true } },
      },
    });

    for (const row of rows) {
      const verdict = classifyExtractorVersion(row.extractorName, row.extractorVersion, current);
      if (!verdict.stale) continue;
      stale.push({
        workspaceId: row.profile.workspaceId,
        profileId: row.profileId,
        versionId: row.id,
        versionNumber: row.versionNumber,
        extractorName: row.extractorName,
        extractorVersion: row.extractorVersion,
        reasons: verdict.reasons,
        createdAt: row.createdAt,
        isConfirmed: row.profile.confirmedVersionId === row.id,
        documentId: row.documentId,
        sourceDocumentAvailable: isSourceDocumentAvailable(row.documentId, row.document, now),
      });
    }

    if (rows.length < batchSize) break;
    cursor = rows[rows.length - 1]?.id;
    if (!cursor) break;
  }

  return stale;
}

export interface StaleVersionReport {
  generatedAt: string;
  current: CurrentExtractorVersions;
  total: number;
  reextractable: number;
  confirmed: number;
  byReason: Partial<Record<StaleReason, number>>;
  versions: StaleProfileVersion[];
}

export function summarizeStaleVersions(
  versions: StaleProfileVersion[],
  now: Date,
  current: CurrentExtractorVersions = currentExtractorVersions(),
): StaleVersionReport {
  const byReason: Partial<Record<StaleReason, number>> = {};
  for (const version of versions) {
    for (const reason of version.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
  return {
    generatedAt: now.toISOString(),
    current,
    total: versions.length,
    reextractable: versions.filter((v) => v.sourceDocumentAvailable).length,
    confirmed: versions.filter((v) => v.isConfirmed).length,
    byReason,
    versions,
  };
}
