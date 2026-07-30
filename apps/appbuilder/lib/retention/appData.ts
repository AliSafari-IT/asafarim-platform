import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { deleteObject } from "@asafarim/storage";
import type { Db } from "../db/client";
import {
  conversationAttachments,
  conversationMemories,
  conversationMessages,
  conversationReferences,
  conversations,
  modificationJobs,
  modificationPlanSteps,
  modificationPlans,
} from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "../repositories/authz";
import { recordAuditEvent } from "../repositories/audit";
import { recordOperationalEvent } from "../observability/events";
import { RETENTION_POLICIES } from "./policy";

/**
 * M13 slice G — "deletion/export are complete" (the slice's exit criterion)
 * and "Claimed files/text/thumbnails … include in app deletion/export"
 * (docs/appbuilder-m13-multimodal-contextual-assistant.md).
 *
 * Before this, `archiveApp` was the only lifecycle operation and it
 * deliberately deletes nothing, while the retention policy catalogue
 * described several categories as "operator-assisted" with no code path to
 * assist with. That was defensible for M12's scope but not for a milestone
 * that persists people's uploaded files, extracted text, and third-party
 * content — an owner has to be able to see exactly what is retained and to
 * get rid of it.
 *
 * The two operations are deliberately asymmetric:
 *
 * - **Export is a read.** It returns everything retained *about the
 *   conversation*, including message text, extracted attachment text, and
 *   imported reference text — because the point is to hand the owner their
 *   own data, and an export that omitted the content would be a table of
 *   contents, not an export. It does NOT include storage keys (never
 *   returned by anything, per slice B) or other principals' identifiers
 *   beyond the ids already visible in the workspace.
 *
 * - **Erasure is a write, and it is not "archive but harder".** It removes
 *   content while leaving the app, its specification, its versions, and its
 *   audit trail intact. Conversation *history* is preserved as tombstones
 *   rather than deleted rows: a message row keeps its id, type, and
 *   timestamps and loses its content. This is the same choice slice F made
 *   for references and this slice made for attachment deletion, and it is
 *   what lets the workspace still render a coherent, if empty, history
 *   afterwards instead of showing a conversation with holes in it.
 */

// ─── Export ───────────────────────────────────────────────────────────────

export interface AppDataExport {
  appId: string;
  generatedAt: string;
  /** Bumped when the shape below changes, so a consumer can tell two exports apart. */
  formatVersion: string;
  conversation: {
    id: string | null;
    messages: Array<{
      id: string;
      role: string;
      messageType: string;
      content: string;
      authorPrincipalId: string | null;
      baseVersionNumber: number | null;
      resultingVersionNumber: number | null;
      modificationJobId: string | null;
      failureCode: string | null;
      createdAt: string;
    }>;
  };
  attachments: Array<{
    id: string;
    messageId: string | null;
    originalFilename: string;
    declaredMimeType: string;
    detectedMimeType: string | null;
    sizeBytes: number;
    sha256: string | null;
    status: string;
    extractionKind: string | null;
    extractedText: string | null;
    uploadedByPrincipalId: string;
    createdAt: string;
    deletedAt: string | null;
  }>;
  references: Array<{
    id: string;
    sourceUrl: string;
    finalUrl: string | null;
    host: string;
    adapter: string;
    adapterVersion: string;
    status: string;
    title: string | null;
    extractedText: string | null;
    facts: Record<string, unknown>[];
    fetchedAt: string | null;
    refreshCount: number;
    createdAt: string;
    deletedAt: string | null;
  }>;
  memory: {
    specificationVersionNumber: number;
    references: Record<string, unknown>[];
    assumptions: Record<string, unknown>[];
    preferences: Record<string, unknown>[];
    updatedAt: string;
  } | null;
  plans: Array<{
    id: string;
    summary: string;
    status: string;
    capabilityAssessment: Record<string, unknown>;
    createdAt: string;
    steps: Array<{
      stepNumber: number;
      title: string;
      status: string;
      resultingVersionNumber: number | null;
      failureMessage: string | null;
    }>;
  }>;
  modificationJobs: Array<{
    id: string;
    status: string;
    userRequestText: string;
    correlationId: string | null;
    contextManifest: Record<string, unknown> | null;
    clarificationState: Record<string, unknown> | null;
    failureCode: string | null;
    createdAt: string;
  }>;
  /** The policy each exported category is retained under, so the export is self-describing. */
  retentionPolicies: typeof RETENTION_POLICIES;
  /** Named here rather than silently omitted — an export must be honest about its own edges. */
  notIncluded: string[];
}

export const APP_DATA_EXPORT_FORMAT_VERSION = "m13.g.1";

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Everything this app retains about its conversation, as one document.
 *
 * Attachment BYTES are not inlined. A single export would otherwise be
 * hundreds of megabytes assembled in memory, and every attachment is already
 * individually downloadable through its own authenticated content route —
 * which this export names for each file. That is a scope decision stated in
 * `notIncluded`, not an omission left for the reader to discover.
 */
export async function exportAppData(
  db: Db,
  actor: Actor,
  appId: string,
  now: Date = new Date()
): Promise<AppDataExport> {
  await assertCapability(db, actor, appId, "app.exportData");

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.appId, appId))
    .limit(1);

  const messages = conversation
    ? await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversation.id))
        .orderBy(conversationMessages.createdAt)
    : [];

  const [attachments, references, memoryRows, plans, jobs] = await Promise.all([
    db.select().from(conversationAttachments).where(eq(conversationAttachments.appId, appId)),
    db.select().from(conversationReferences).where(eq(conversationReferences.appId, appId)),
    db.select().from(conversationMemories).where(eq(conversationMemories.appId, appId)).limit(1),
    db.select().from(modificationPlans).where(eq(modificationPlans.appId, appId)).orderBy(desc(modificationPlans.createdAt)),
    db.select().from(modificationJobs).where(eq(modificationJobs.appId, appId)).orderBy(desc(modificationJobs.createdAt)),
  ]);

  const steps = plans.length
    ? await db
        .select()
        .from(modificationPlanSteps)
        .where(inArray(modificationPlanSteps.planId, plans.map((p) => p.id)))
        .orderBy(modificationPlanSteps.stepNumber)
    : [];

  const memory = memoryRows[0] ?? null;

  await recordAuditEvent(db, {
    appId,
    actorPrincipalId: actor.principalId,
    action: "app.data_exported",
    targetType: "app",
    targetId: appId,
    metadata: {
      messages: messages.length,
      attachments: attachments.length,
      references: references.length,
    },
  });

  return {
    appId,
    generatedAt: now.toISOString(),
    formatVersion: APP_DATA_EXPORT_FORMAT_VERSION,
    conversation: {
      id: conversation?.id ?? null,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        messageType: m.messageType,
        content: m.content,
        authorPrincipalId: m.authorPrincipalId,
        baseVersionNumber: m.baseVersionNumber,
        resultingVersionNumber: m.resultingVersionNumber,
        modificationJobId: m.modificationJobId,
        failureCode: m.failureCode,
        createdAt: m.createdAt.toISOString(),
      })),
    },
    attachments: attachments.map((a) => ({
      id: a.id,
      messageId: a.messageId,
      originalFilename: a.originalFilename,
      declaredMimeType: a.declaredMimeType,
      detectedMimeType: a.detectedMimeType,
      sizeBytes: a.actualSizeBytes ?? a.declaredSizeBytes,
      sha256: a.sha256,
      status: a.status,
      extractionKind: a.extractionKind,
      extractedText: a.extractedText,
      uploadedByPrincipalId: a.uploadedByPrincipalId,
      createdAt: a.createdAt.toISOString(),
      deletedAt: iso(a.deletedAt),
    })),
    references: references.map((r) => ({
      id: r.id,
      sourceUrl: r.sourceUrl,
      finalUrl: r.finalUrl,
      host: r.host,
      adapter: r.adapter,
      adapterVersion: r.adapterVersion,
      status: r.status,
      title: r.title,
      extractedText: r.extractedText,
      facts: r.facts,
      fetchedAt: iso(r.fetchedAt),
      refreshCount: r.refreshCount,
      createdAt: r.createdAt.toISOString(),
      deletedAt: iso(r.deletedAt),
    })),
    memory: memory
      ? {
          specificationVersionNumber: memory.specificationVersionNumber,
          references: memory.references,
          assumptions: memory.assumptions,
          preferences: memory.preferences,
          updatedAt: memory.updatedAt.toISOString(),
        }
      : null,
    plans: plans.map((plan) => ({
      id: plan.id,
      summary: plan.summary,
      status: plan.status,
      capabilityAssessment: plan.capabilityAssessment,
      createdAt: plan.createdAt.toISOString(),
      steps: steps
        .filter((s) => s.planId === plan.id)
        .map((s) => ({
          stepNumber: s.stepNumber,
          title: s.title,
          status: s.status,
          resultingVersionNumber: s.resultingVersionNumber,
          failureMessage: s.failureMessage,
        })),
    })),
    modificationJobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      userRequestText: j.userRequestText,
      correlationId: j.correlationId,
      contextManifest: j.contextManifest,
      clarificationState: j.clarificationState,
      failureCode: j.failureCode,
      createdAt: j.createdAt.toISOString(),
    })),
    retentionPolicies: RETENTION_POLICIES,
    notIncluded: [
      "Attachment file bytes — download each individually from /api/apps/{appId}/conversation/attachments/{attachmentId}/content.",
      "Storage keys — server-generated and never returned by any route (M13 slice B).",
      "The application specification and its version history — exported separately via the specification API.",
      "Generated-app runtime data (records, files, members) — a separate dataset with its own access rules (M09).",
      "Assembled prompts — never persisted at all; only the safe context manifest is (see modification_jobs.context_manifest).",
    ],
  };
}

// ─── Erasure ──────────────────────────────────────────────────────────────

export interface AppDataErasureResult {
  appId: string;
  erasedAt: string;
  messagesTombstoned: number;
  attachmentsErased: number;
  attachmentObjectsDeleted: number;
  referencesErased: number;
  memoryCleared: boolean;
  jobRequestTextsCleared: number;
}

/** Replaces erased message content. Constant so a reader can recognise it and so it can be searched for. */
export const ERASED_CONTENT_PLACEHOLDER = "[erased at the owner's request]";

/**
 * Irreversibly erases this app's retained conversation CONTENT.
 *
 * What is destroyed: message bodies, attachment objects and their extracted
 * text, imported reference text and facts, all memory facts, and the stored
 * copy of each modification request's text.
 *
 * What survives, and why:
 *
 * - **The app, its specification, and every version.** Those are the product
 *   the owner built, not a record of their conversation. Erasing them is
 *   what deleting the app means, and it is a different operation with a
 *   different blast radius.
 * - **Row skeletons.** Ids, types, timestamps, and version numbers remain so
 *   the workspace can still render an intelligible history ("a request was
 *   made here, this version resulted") rather than an incoherent one.
 * - **`audit_events`.** Append-only by policy (lib/retention/policy.ts) and
 *   the only record that the erasure itself happened. An erasure that erased
 *   its own evidence would be unauditable.
 *
 * Not transactional across storage: object deletes happen first and are
 * best-effort, then the rows are updated in one transaction. A storage
 * delete that fails leaves the row's content cleared anyway — losing the
 * pointer to an object is recoverable by a later sweep, whereas keeping
 * readable content because an unrelated object delete failed is not what
 * anyone asking for erasure wants.
 */
export async function eraseAppData(
  db: Db,
  actor: Actor,
  appId: string,
  now: Date = new Date()
): Promise<AppDataErasureResult> {
  await assertCapability(db, actor, appId, "app.eraseData");

  const attachments = await db
    .select()
    .from(conversationAttachments)
    .where(eq(conversationAttachments.appId, appId));

  let attachmentObjectsDeleted = 0;
  for (const attachment of attachments) {
    if (attachment.status === "deleted") continue;
    const ok = await deleteObject(attachment.storageKey).then(
      () => true,
      () => false
    );
    if (ok) attachmentObjectsDeleted += 1;
    if (attachment.thumbnailStorageKey) {
      await deleteObject(attachment.thumbnailStorageKey).catch(() => undefined);
    }
  }

  const result = await db.transaction(async (tx) => {
    const messages = await tx
      .update(conversationMessages)
      .set({ content: ERASED_CONTENT_PLACEHOLDER, selectedContext: null, diffSummary: null })
      .where(eq(conversationMessages.appId, appId))
      .returning({ id: conversationMessages.id });

    // Two statements, not one, because `deletedAt` means different things
    // for the two groups. A row already tombstoned by an explicit user
    // deletion carries the timestamp of THAT deletion, which is audit
    // evidence and must not be rewritten to now; it only needs its extracted
    // text cleared in case it predates the slice G change that started
    // clearing it. Every other row — ready, quarantined, or still mid-upload
    // — is being tombstoned right now and gets today's timestamp.
    const alreadyTombstoned = await tx
      .update(conversationAttachments)
      .set({ extractedText: null, updatedAt: now })
      .where(and(eq(conversationAttachments.appId, appId), eq(conversationAttachments.status, "deleted")))
      .returning({ id: conversationAttachments.id });

    const newlyErased = await tx
      .update(conversationAttachments)
      .set({ status: "deleted", extractedText: null, deletedAt: now, updatedAt: now })
      .where(and(eq(conversationAttachments.appId, appId), ne(conversationAttachments.status, "deleted")))
      .returning({ id: conversationAttachments.id });

    const erasedReferences = await tx
      .update(conversationReferences)
      .set({
        status: "deleted",
        extractedText: null,
        facts: [],
        title: null,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(conversationReferences.appId, appId))
      .returning({ id: conversationReferences.id });

    const clearedMemory = await tx
      .update(conversationMemories)
      .set({ references: [], assumptions: [], preferences: [], updatedAt: now })
      .where(eq(conversationMemories.appId, appId))
      .returning({ id: conversationMemories.id });

    const clearedJobs = await tx
      .update(modificationJobs)
      .set({ userRequestText: ERASED_CONTENT_PLACEHOLDER, normalizedRequest: null })
      .where(eq(modificationJobs.appId, appId))
      .returning({ id: modificationJobs.id });

    return {
      messagesTombstoned: messages.length,
      attachmentsErased: alreadyTombstoned.length + newlyErased.length,
      referencesErased: erasedReferences.length,
      memoryCleared: clearedMemory.length > 0,
      jobRequestTextsCleared: clearedJobs.length,
    };
  });

  await recordAuditEvent(db, {
    appId,
    actorPrincipalId: actor.principalId,
    action: "app.data_erased",
    targetType: "app",
    targetId: appId,
    metadata: { ...result, attachmentObjectsDeleted },
  });

  await recordOperationalEvent(db, {
    appId,
    category: "storage",
    kind: "retention.swept",
    severity: "warning",
    actorPrincipalId: actor.principalId,
    detail: { reason: "owner_erasure_request", ...result, attachmentObjectsDeleted },
  });

  return { appId, erasedAt: now.toISOString(), attachmentObjectsDeleted, ...result };
}
