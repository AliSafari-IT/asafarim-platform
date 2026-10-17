import { describe, expect, it, vi } from "vitest";
import { EXTRACT_MODEL_VERSIONS } from "./ai/registry";
import { EXTRACT_PROMPT_VERSION } from "./ai/prompts";
import {
  type CurrentExtractorVersions,
  type StaleVersionsDb,
  classifyExtractorVersion,
  currentExtractorVersions,
  isSourceDocumentAvailable,
  listStaleProfileVersions,
  summarizeStaleVersions,
} from "./staleVersions";
import { PROFILE_EXTRACTOR_NAME, PROFILE_EXTRACTOR_VERSION } from "./profileExtractor";
import { EXTRACTOR_NAME, EXTRACTOR_VERSION } from "./text";

// Stamps exactly as lib/documents/service.ts writes them today.
const RULES_NAME = `${EXTRACTOR_NAME}+${PROFILE_EXTRACTOR_NAME}`;
const RULES_VERSION = `${EXTRACTOR_VERSION}+${PROFILE_EXTRACTOR_VERSION}`;
const AI_NAME = `${EXTRACTOR_NAME}+${PROFILE_EXTRACTOR_NAME}-ai`;
const aiVersion = (provider: string, model: string, prompt = EXTRACT_PROMPT_VERSION) =>
  `${EXTRACTOR_VERSION}+${provider}:${model}:${prompt}`;

function bumped(overrides: Partial<CurrentExtractorVersions>): CurrentExtractorVersions {
  return { ...currentExtractorVersions(), ...overrides };
}

describe("classifyExtractorVersion", () => {
  it("treats today's rule-based and AI stamps as current", () => {
    expect(classifyExtractorVersion(RULES_NAME, RULES_VERSION)).toEqual({ stale: false, reasons: [] });
    expect(classifyExtractorVersion(AI_NAME, aiVersion("openai", EXTRACT_MODEL_VERSIONS.openai))).toEqual({
      stale: false,
      reasons: [],
    });
  });

  it("flags a rule-based version after PROFILE_EXTRACTOR_VERSION is bumped", () => {
    expect(classifyExtractorVersion(RULES_NAME, RULES_VERSION, bumped({ rulesVersion: "1.0.1" }))).toEqual({
      stale: true,
      reasons: ["PROFILE_RULES_VERSION"],
    });
  });

  it("flags any extracted version after the text layer is bumped", () => {
    const current = bumped({ textVersion: "1.1.0" });
    expect(classifyExtractorVersion(RULES_NAME, RULES_VERSION, current).reasons).toEqual(["TEXT_EXTRACTOR_VERSION"]);
    expect(
      classifyExtractorVersion(AI_NAME, aiVersion("openai", EXTRACT_MODEL_VERSIONS.openai), current).reasons,
    ).toEqual(["TEXT_EXTRACTOR_VERSION"]);
  });

  it("flags an AI version after the prompt is bumped, and not after a rules bump", () => {
    const stamp = aiVersion("openai", EXTRACT_MODEL_VERSIONS.openai);
    expect(classifyExtractorVersion(AI_NAME, stamp, bumped({ promptVersion: "extract_profile@2" })).reasons).toEqual([
      "EXTRACT_PROMPT_VERSION",
    ]);
    expect(classifyExtractorVersion(AI_NAME, stamp, bumped({ rulesVersion: "2.0.0" })).stale).toBe(false);
  });

  it("reports a model change as its own reason", () => {
    expect(classifyExtractorVersion(AI_NAME, aiVersion("openai", "gpt-old")).reasons).toEqual(["EXTRACT_MODEL_VERSION"]);
  });

  it("reads a model id that itself contains ':'", () => {
    const current = bumped({ modelVersions: { ...EXTRACT_MODEL_VERSIONS, openai: "ft:gpt-4o-mini:acme" } });
    expect(classifyExtractorVersion(AI_NAME, aiVersion("openai", "ft:gpt-4o-mini:acme"), current).stale).toBe(false);
  });

  it("lists stamps it can't read instead of guessing", () => {
    const unknown = { stale: true, reasons: ["UNRECOGNIZED_EXTRACTOR"] };
    expect(classifyExtractorVersion("manual", "1.0.0")).toEqual(unknown);
    expect(classifyExtractorVersion(`other-text+${PROFILE_EXTRACTOR_NAME}`, RULES_VERSION)).toEqual(unknown);
    expect(classifyExtractorVersion(`${EXTRACTOR_NAME}+someone-else`, RULES_VERSION)).toEqual(unknown);
    expect(classifyExtractorVersion(AI_NAME, `${EXTRACTOR_VERSION}+openai`)).toEqual(unknown);
    expect(classifyExtractorVersion(AI_NAME, aiVersion("mistral", "m-1"))).toEqual(unknown);
    expect(classifyExtractorVersion(AI_NAME, aiVersion("toString", "m-1"))).toEqual(unknown);
    expect(classifyExtractorVersion(RULES_NAME, "1.0.0+")).toEqual(unknown);
  });
});

describe("isSourceDocumentAvailable", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const kept = { deletedAt: null, retainUntil: null };

  it("is true only for a linked, undeleted document within retention", () => {
    expect(isSourceDocumentAvailable("doc_1", kept, now)).toBe(true);
    expect(isSourceDocumentAvailable("doc_1", { deletedAt: null, retainUntil: new Date("2026-11-01T00:00:00Z") }, now)).toBe(true);
    expect(isSourceDocumentAvailable(null, null, now)).toBe(false);
    expect(isSourceDocumentAvailable("doc_1", null, now)).toBe(false);
    expect(isSourceDocumentAvailable("doc_1", { deletedAt: new Date("2026-10-01T00:00:00Z"), retainUntil: null }, now)).toBe(false);
    expect(isSourceDocumentAvailable("doc_1", { deletedAt: null, retainUntil: now }, now)).toBe(false);
  });
});

type Row = {
  id: string;
  profileId: string;
  versionNumber: number;
  extractorName: string;
  extractorVersion: string;
  createdAt: Date;
  documentId: string | null;
  profile: { workspaceId: string; confirmedVersionId: string | null };
  document: { deletedAt: Date | null; retainUntil: Date | null } | null;
};

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    profileId: `profile_${id}`,
    versionNumber: 1,
    extractorName: RULES_NAME,
    extractorVersion: RULES_VERSION,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    documentId: `doc_${id}`,
    profile: { workspaceId: `ws_${id}`, confirmedVersionId: null },
    document: { deletedAt: null, retainUntil: null },
    ...overrides,
  };
}

type FindManyArgs = {
  where: unknown;
  select: Record<string, unknown>;
  take: number;
  cursor?: { id: string };
  skip?: number;
};

/** A stub that honours the id cursor the way Prisma does. */
function stubDb(rows: Row[]) {
  const findMany = vi.fn(async (args: FindManyArgs) => {
    const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const start = args.cursor ? sorted.findIndex((r) => r.id === args.cursor?.id) + (args.skip ?? 0) : 0;
    return sorted.slice(start, start + args.take);
  });
  return { db: { candidateProfileVersion: { findMany } } as unknown as StaleVersionsDb, findMany };
}

describe("listStaleProfileVersions", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const current = bumped({ rulesVersion: "1.0.1" });

  it("lists only stale versions, with confirmation and document availability", async () => {
    const { db } = stubDb([
      row("a", { profile: { workspaceId: "ws_a", confirmedVersionId: "a" }, versionNumber: 3 }),
      row("b", { documentId: null, document: null }),
      row("c", { document: { deletedAt: null, retainUntil: new Date("2026-10-01T00:00:00Z") } }),
      row("d", { extractorName: AI_NAME, extractorVersion: aiVersion("openai", EXTRACT_MODEL_VERSIONS.openai) }),
    ]);

    const stale = await listStaleProfileVersions(db, { now, current });

    expect(stale.map((v) => v.versionId)).toEqual(["a", "b", "c"]);
    expect(stale[0]).toEqual({
      workspaceId: "ws_a",
      profileId: "profile_a",
      versionId: "a",
      versionNumber: 3,
      extractorName: RULES_NAME,
      extractorVersion: RULES_VERSION,
      reasons: ["PROFILE_RULES_VERSION"],
      createdAt: new Date("2026-09-01T00:00:00Z"),
      isConfirmed: true,
      documentId: "doc_a",
      sourceDocumentAvailable: true,
    });
    expect(stale[1]?.sourceDocumentAvailable).toBe(false);
    expect(stale[2]?.sourceDocumentAvailable).toBe(false);
    expect(stale[1]?.isConfirmed).toBe(false);
  });

  it("reads EXTRACTED versions only and never selects content", async () => {
    const { db, findMany } = stubDb([]);
    await listStaleProfileVersions(db, { now, current });

    const args = findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ origin: "EXTRACTED" });
    expect(args?.select).not.toHaveProperty("content");
    expect(args?.select).not.toHaveProperty("confidence");
    expect(JSON.stringify(args?.select)).not.toContain("originalFilename");
    expect(JSON.stringify(args?.select)).not.toContain("storageKey");
  });

  it("walks every batch", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`r${i}`));
    const { db, findMany } = stubDb(rows);

    const stale = await listStaleProfileVersions(db, { now, current, batchSize: 3 });

    expect(stale).toHaveLength(7);
    expect(new Set(stale.map((v) => v.versionId)).size).toBe(7);
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it("finds nothing when every stamp is current", async () => {
    const { db } = stubDb([row("a"), row("b")]);
    expect(await listStaleProfileVersions(db, { now })).toEqual([]);
  });
});

describe("summarizeStaleVersions", () => {
  it("counts totals, re-extractable, confirmed and reasons", async () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const current = bumped({ rulesVersion: "1.0.1", textVersion: "1.1.0" });
    const { db } = stubDb([
      row("a", { profile: { workspaceId: "ws_a", confirmedVersionId: "a" } }),
      row("b", { documentId: null, document: null }),
    ]);
    const report = summarizeStaleVersions(await listStaleProfileVersions(db, { now, current }), now, current);

    expect(report).toMatchObject({
      generatedAt: "2026-10-17T12:00:00.000Z",
      total: 2,
      reextractable: 1,
      confirmed: 1,
      byReason: { TEXT_EXTRACTOR_VERSION: 2, PROFILE_RULES_VERSION: 2 },
    });
  });
});
