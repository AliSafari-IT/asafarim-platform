import "server-only";
import { getJobmatchDb } from "../db/client";
import { recordAuditEvent } from "../workspace";
import {
  type CandidateProfileContent,
  type ProfileConfidence,
  confidenceSchema,
  parseProfileContent,
} from "./contract";

/**
 * Immutable profile versions (JM-022).
 *
 * Nothing here updates a version's content. A correction writes a *new*
 * version whose `parentVersionId` points at what it corrected, so the exact
 * profile that produced a past match still exists, alongside the document
 * hash and extractor version that produced it. That lineage is what makes
 * "why was I shown this job in March" answerable at all.
 *
 * The only mutable thing is which version is *confirmed*, and that lives on
 * the profile row rather than on the version.
 */

export interface VersionSummary {
  id: string;
  versionNumber: number;
  origin: "EXTRACTED" | "CORRECTED" | "MANUAL";
  extractorName: string;
  extractorVersion: string;
  createdAt: Date;
  isConfirmed: boolean;
}

export interface VersionDetail extends VersionSummary {
  content: CandidateProfileContent;
  confidence: ProfileConfidence;
  documentId: string | null;
  sourceContentHash: string | null;
  parentVersionId: string | null;
}

/** The workspace's profile row, created on first use. */
export async function ensureProfile(workspaceId: string): Promise<{ id: string; confirmedVersionId: string | null }> {
  const db = getJobmatchDb();
  const existing = await db.candidateProfile.findUnique({
    where: { workspaceId },
    select: { id: true, confirmedVersionId: true },
  });
  if (existing) return existing;

  try {
    return await db.candidateProfile.create({
      data: { workspaceId },
      select: { id: true, confirmedVersionId: true },
    });
  } catch (error) {
    // Same first-visit race as the workspace itself; the unique index on
    // workspaceId makes the loser's re-read correct rather than a 500.
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.candidateProfile.findUnique({
      where: { workspaceId },
      select: { id: true, confirmedVersionId: true },
    });
    if (raced) return raced;
    throw error;
  }
}

export interface CreateVersionInput {
  workspaceId: string;
  content: unknown;
  origin: "EXTRACTED" | "CORRECTED" | "MANUAL";
  extractorName: string;
  extractorVersion: string;
  confidence?: unknown;
  documentId?: string | null;
  sourceContentHash?: string | null;
  parentVersionId?: string | null;
}

/**
 * Write a new version. Content is re-validated here even when the caller
 * has already parsed it: this is the last point before the database, and a
 * profile row containing a protected attribute is exactly the thing that
 * must never exist, whatever path produced it.
 */
export async function createVersion(input: CreateVersionInput): Promise<VersionDetail> {
  const db = getJobmatchDb();
  const content = parseProfileContent(input.content);
  const confidence = input.confidence ? confidenceSchema.parse(input.confidence) : {};

  const profile = await ensureProfile(input.workspaceId);

  // Serialized so two concurrent writers cannot both claim the same
  // versionNumber; the unique index would reject the loser anyway, and this
  // turns that into a correct number rather than an error.
  const version = await db.$transaction(async (tx) => {
    const latest = await tx.candidateProfileVersion.findFirst({
      where: { profileId: profile.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    return tx.candidateProfileVersion.create({
      data: {
        profileId: profile.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        origin: input.origin,
        extractorName: input.extractorName,
        extractorVersion: input.extractorVersion,
        content,
        confidence,
        documentId: input.documentId ?? null,
        // Copied rather than joined, so provenance survives the document's
        // deletion under retention or an erasure request.
        sourceContentHash: input.sourceContentHash ?? null,
        parentVersionId: input.parentVersionId ?? null,
      },
    });
  });

  await recordAuditEvent(input.workspaceId, "profile.version.created", {
    outcome: input.origin,
    count: version.versionNumber,
  });

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    origin: version.origin,
    extractorName: version.extractorName,
    extractorVersion: version.extractorVersion,
    createdAt: version.createdAt,
    isConfirmed: false,
    content,
    confidence,
    documentId: version.documentId,
    sourceContentHash: version.sourceContentHash,
    parentVersionId: version.parentVersionId,
  };
}

/**
 * Confirm a version. This is the gate the whole milestone turns on:
 * matching reads the confirmed version and nothing else, so extraction
 * output cannot reach a match until a person has looked at it.
 */
export async function confirmVersion(workspaceId: string, versionId: string): Promise<boolean> {
  const db = getJobmatchDb();
  const profile = await ensureProfile(workspaceId);

  // Ownership is checked by scoping to this workspace's profile rather than
  // by trusting the id from the request.
  const version = await db.candidateProfileVersion.findFirst({
    where: { id: versionId, profileId: profile.id },
    select: { id: true, versionNumber: true },
  });
  if (!version) return false;

  await db.candidateProfile.update({
    where: { id: profile.id },
    data: { confirmedVersionId: version.id },
  });

  await recordAuditEvent(workspaceId, "profile.version.confirmed", {
    count: version.versionNumber,
  });
  return true;
}

export async function listVersions(workspaceId: string): Promise<VersionSummary[]> {
  const db = getJobmatchDb();
  const profile = await db.candidateProfile.findUnique({
    where: { workspaceId },
    select: {
      id: true,
      confirmedVersionId: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          origin: true,
          extractorName: true,
          extractorVersion: true,
          createdAt: true,
        },
      },
    },
  });
  if (!profile) return [];

  return profile.versions.map((version) => ({
    ...version,
    isConfirmed: version.id === profile.confirmedVersionId,
  }));
}

/** A version by id, scoped to the workspace so an id from the client cannot
 *  reach another candidate's profile. */
export async function getVersion(
  workspaceId: string,
  versionId: string,
): Promise<VersionDetail | null> {
  const db = getJobmatchDb();
  const version = await db.candidateProfileVersion.findFirst({
    where: { id: versionId, profile: { workspaceId } },
    include: { profile: { select: { confirmedVersionId: true } } },
  });
  if (!version) return null;

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    origin: version.origin,
    extractorName: version.extractorName,
    extractorVersion: version.extractorVersion,
    createdAt: version.createdAt,
    isConfirmed: version.profile.confirmedVersionId === version.id,
    // Validated on read as well as on write: a version written under an
    // older contract must fail loudly rather than flow into matching as a
    // half-understood shape.
    content: parseProfileContent(version.content),
    confidence: confidenceSchema.parse(version.confidence ?? {}),
    documentId: version.documentId,
    sourceContentHash: version.sourceContentHash,
    parentVersionId: version.parentVersionId,
  };
}

/** The latest version, confirmed or not — what the review screen opens on. */
export async function getLatestVersion(workspaceId: string): Promise<VersionDetail | null> {
  const db = getJobmatchDb();
  const latest = await db.candidateProfileVersion.findFirst({
    where: { profile: { workspaceId } },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  return latest ? getVersion(workspaceId, latest.id) : null;
}

/** The confirmed version — the only one matching is ever allowed to read. */
export async function getConfirmedVersion(workspaceId: string): Promise<VersionDetail | null> {
  const db = getJobmatchDb();
  const profile = await db.candidateProfile.findUnique({
    where: { workspaceId },
    select: { confirmedVersionId: true },
  });
  if (!profile?.confirmedVersionId) return null;
  return getVersion(workspaceId, profile.confirmedVersionId);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
