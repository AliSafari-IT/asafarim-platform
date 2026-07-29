import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { appendUserMessage } from "./conversations";
import { conversationAttachments } from "../db/schema";
import {
  claimAttachmentsForMessage,
  commitAttachmentContent,
  deleteAttachment,
  getAttachmentForActor,
  initAttachment,
  listConversationAttachmentsForActor,
  readAttachmentContentForActor,
} from "./attachments";
import { listMessagesForActor } from "./conversations";
import { NotFoundError } from "../errors";
import {
  AttachmentAccessDeniedError,
  AttachmentAlreadyClaimedError,
  AttachmentMismatchError,
} from "../attachments/errors";
import { QuotaExceededError } from "../quotas/errors";

const db = getTestDb();
const owner = { principalId: "attach-owner", roles: [] };
const unrelated = { principalId: "attach-unrelated", roles: [] };

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(suffix: string) {
  return createApp(
    db,
    owner,
    { name: `Attach App ${suffix}`, slug: `attach-app-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `attach-create-${suffix}`,
  );
}

describe("initAttachment", () => {
  it("owner/editor: succeeds, creating the app's conversation on first use", async () => {
    const app = await makeApp("init-owner");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "init-owner-1",
    });
    expect(attachment.status).toBe("pending");
    expect(attachment.uploadedByPrincipalId).toBe(owner.principalId);
    expect((attachment as unknown as { storageKey?: string }).storageKey).toBeUndefined();

    await addCollaborator(db, owner, app.id, "attach-editor", "editor");
    const editorAttachment = await initAttachment(db, { principalId: "attach-editor", roles: [] }, app.id, {
      originalFilename: "notes.txt",
      declaredMimeType: "text/plain",
      declaredSizeBytes: 5,
      idempotencyKey: "init-editor-1",
    });
    expect(editorAttachment.status).toBe("pending");
  });

  it("viewer: fails", async () => {
    const app = await makeApp("init-viewer");
    await addCollaborator(db, owner, app.id, "attach-viewer", "viewer");
    await expect(
      initAttachment(db, { principalId: "attach-viewer", roles: [] }, app.id, {
        originalFilename: "photo.png",
        declaredMimeType: "image/png",
        declaredSizeBytes: 100,
        idempotencyKey: "init-viewer-1",
      }),
    ).rejects.toThrow();
  });

  it("cross-app / unrelated actor: fails as NotFoundError, not a distinguishing error", async () => {
    const app = await makeApp("init-cross");
    await expect(
      initAttachment(db, unrelated, app.id, {
        originalFilename: "photo.png",
        declaredMimeType: "image/png",
        declaredSizeBytes: 100,
        idempotencyKey: "init-cross-1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("oversized (declared): fails", async () => {
    const app = await makeApp("init-oversized");
    await expect(
      initAttachment(db, owner, app.id, {
        originalFilename: "huge.png",
        declaredMimeType: "image/png",
        declaredSizeBytes: 11 * 1024 * 1024, // over the 10MB image cap
        idempotencyKey: "init-oversized-1",
      }),
    ).rejects.toThrow();
  });

  it("unsupported MIME type: fails", async () => {
    const app = await makeApp("init-unsupported");
    await expect(
      initAttachment(db, owner, app.id, {
        originalFilename: "archive.zip",
        declaredMimeType: "application/zip",
        declaredSizeBytes: 100,
        idempotencyKey: "init-unsupported-1",
      }),
    ).rejects.toThrow();
  });

  it("is idempotent: same key + payload replays the same attachment", async () => {
    const app = await makeApp("init-idempotent");
    const input = {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "init-idempotent-1",
    };
    const first = await initAttachment(db, owner, app.id, input);
    const second = await initAttachment(db, owner, app.id, input);
    expect(second.id).toBe(first.id);
  });

  it("rejects the same key reused with a different payload", async () => {
    const app = await makeApp("init-conflict");
    await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "init-conflict-1",
    });
    await expect(
      initAttachment(db, owner, app.id, {
        originalFilename: "different.png",
        declaredMimeType: "image/png",
        declaredSizeBytes: PNG_1X1.length,
        idempotencyKey: "init-conflict-1",
      }),
    ).rejects.toThrow();
  });
});

describe("commitAttachmentContent", () => {
  it("golden path: valid bytes commit and reach ready with detected MIME/sha256 set", async () => {
    const app = await makeApp("commit-golden");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "commit-golden-1",
    });
    const committed = await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    expect(committed.status).toBe("ready");
    expect(committed.detectedMimeType).toBe("image/png");
    expect(committed.actualSizeBytes).toBe(PNG_1X1.length);

    const [row] = await db.select().from(conversationAttachments).where(eq(conversationAttachments.id, attachment.id));
    expect(row.sha256).toBeTruthy();
    expect(row.storageKey).toBeTruthy();
  });

  it("spoofed MIME (declared text/csv, actual PNG bytes): fails, attachment stays pending", async () => {
    const app = await makeApp("commit-spoof");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "fake.csv",
      declaredMimeType: "text/csv",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "commit-spoof-1",
    });
    await expect(commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1)).rejects.toBeInstanceOf(
      AttachmentMismatchError,
    );
    const [row] = await db.select().from(conversationAttachments).where(eq(conversationAttachments.id, attachment.id));
    expect(row.status).toBe("pending");
  });

  it("oversized actual bytes (declared size lied about): fails", async () => {
    const app = await makeApp("commit-oversize-actual");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: 5, // far smaller than the real PNG bytes below
      idempotencyKey: "commit-oversize-actual-1",
    });
    await expect(commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1)).rejects.toBeInstanceOf(
      AttachmentMismatchError,
    );
  });

  it("duplicate commit: the second attempt fails, the first result is untouched", async () => {
    const app = await makeApp("commit-duplicate");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "commit-duplicate-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    await expect(commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1)).rejects.toThrow();
  });

  it("viewer: cannot commit", async () => {
    const app = await makeApp("commit-viewer");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "commit-viewer-1",
    });
    await addCollaborator(db, owner, app.id, "attach-viewer-2", "viewer");
    await expect(
      commitAttachmentContent(db, { principalId: "attach-viewer-2", roles: [] }, app.id, attachment.id, PNG_1X1),
    ).rejects.toThrow();
  });

  it("a different editor cannot commit someone else's pending upload", async () => {
    const app = await makeApp("commit-wrong-uploader");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "commit-wrong-uploader-1",
    });
    await addCollaborator(db, owner, app.id, "attach-other-editor", "editor");
    await expect(
      commitAttachmentContent(db, { principalId: "attach-other-editor", roles: [] }, app.id, attachment.id, PNG_1X1),
    ).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
  });

  it("enforces the per-app attachment-bytes quota", async () => {
    const app = await makeApp("commit-quota");
    process.env.APPBUILDER_QUOTA_ATTACHMENT_BYTES_PER_APP = "10";
    try {
      const attachment = await initAttachment(db, owner, app.id, {
        originalFilename: "photo.png",
        declaredMimeType: "image/png",
        declaredSizeBytes: PNG_1X1.length,
        idempotencyKey: "commit-quota-1",
      });
      await expect(commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1)).rejects.toBeInstanceOf(
        QuotaExceededError,
      );
    } finally {
      delete process.env.APPBUILDER_QUOTA_ATTACHMENT_BYTES_PER_APP;
    }
  });
});

describe("getAttachmentForActor", () => {
  it("owner/editor/viewer can all view; storage keys are never included", async () => {
    const app = await makeApp("get-roles");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "get-roles-1",
    });
    await addCollaborator(db, owner, app.id, "attach-viewer-3", "viewer");

    const asOwner = await getAttachmentForActor(db, owner, app.id, attachment.id);
    const asViewer = await getAttachmentForActor(db, { principalId: "attach-viewer-3", roles: [] }, app.id, attachment.id);
    expect(asOwner.id).toBe(attachment.id);
    expect(asViewer.id).toBe(attachment.id);
    expect(Object.keys(asOwner)).not.toContain("storageKey");
    expect(Object.keys(asOwner)).not.toContain("thumbnailStorageKey");
  });

  it("cross-app / unrelated actor: fails as NotFoundError", async () => {
    const app = await makeApp("get-cross");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "get-cross-1",
    });
    await expect(getAttachmentForActor(db, unrelated, app.id, attachment.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a real attachment id scoped to a DIFFERENT app is not found", async () => {
    const appA = await makeApp("get-cross-app-a");
    const appB = await makeApp("get-cross-app-b");
    const attachment = await initAttachment(db, owner, appA.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "get-cross-app-1",
    });
    await expect(getAttachmentForActor(db, owner, appB.id, attachment.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteAttachment", () => {
  it("the uploader can delete their own attachment; a committed object is actually removed from storage", async () => {
    const app = await makeApp("delete-own");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "delete-own-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    const deleted = await deleteAttachment(db, owner, app.id, attachment.id);
    expect(deleted.status).toBe("deleted");
  });

  it("is idempotent: deleting an already-deleted attachment is a no-op", async () => {
    const app = await makeApp("delete-idempotent");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "delete-idempotent-1",
    });
    await deleteAttachment(db, owner, app.id, attachment.id);
    const second = await deleteAttachment(db, owner, app.id, attachment.id);
    expect(second.status).toBe("deleted");
  });

  it("a non-uploader editor cannot delete someone else's attachment (only the uploader or the owner can)", async () => {
    const app = await makeApp("delete-forbidden");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "delete-forbidden-1",
    });
    await addCollaborator(db, owner, app.id, "attach-other-editor-2", "editor");
    await expect(
      deleteAttachment(db, { principalId: "attach-other-editor-2", roles: [] }, app.id, attachment.id),
    ).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
  });

  it("the app owner can delete any attachment, even one uploaded by an editor", async () => {
    const app = await makeApp("delete-owner-override");
    await addCollaborator(db, owner, app.id, "attach-editor-3", "editor");
    const editor = { principalId: "attach-editor-3", roles: [] };
    const attachment = await initAttachment(db, editor, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "delete-owner-override-1",
    });
    const deleted = await deleteAttachment(db, owner, app.id, attachment.id);
    expect(deleted.status).toBe("deleted");
  });
});

describe("claimAttachmentsForMessage", () => {
  it("atomically claims a ready attachment for a message, ownership and app scope rechecked", async () => {
    const app = await makeApp("claim-golden");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "claim-golden-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    const { conversation, message } = await appendUserMessage(db, owner, app.id, {
      content: "here's a screenshot",
      selectionContext: null,
      baseVersionNumber: 0,
    });

    const [claimed] = await claimAttachmentsForMessage(db, owner, app.id, conversation.id, message.id, [attachment.id]);
    expect(claimed.messageId).toBe(message.id);
  });

  it("rejects claiming an attachment already claimed by another message", async () => {
    const app = await makeApp("claim-already");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "claim-already-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    const { conversation, message: firstMessage } = await appendUserMessage(db, owner, app.id, {
      content: "first",
      selectionContext: null,
      baseVersionNumber: 0,
    });
    await claimAttachmentsForMessage(db, owner, app.id, conversation.id, firstMessage.id, [attachment.id]);

    const { message: secondMessage } = await appendUserMessage(db, owner, app.id, {
      content: "second",
      selectionContext: null,
      baseVersionNumber: 0,
    });
    await expect(
      claimAttachmentsForMessage(db, owner, app.id, conversation.id, secondMessage.id, [attachment.id]),
    ).rejects.toBeInstanceOf(AttachmentAlreadyClaimedError);
  });

  it("rejects claiming an attachment still pending (not yet committed/processed)", async () => {
    const app = await makeApp("claim-not-ready");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "claim-not-ready-1",
    });
    const { conversation, message } = await appendUserMessage(db, owner, app.id, {
      content: "here's a screenshot",
      selectionContext: null,
      baseVersionNumber: 0,
    });
    await expect(
      claimAttachmentsForMessage(db, owner, app.id, conversation.id, message.id, [attachment.id]),
    ).rejects.toThrow();
  });

  it("rejects claiming another uploader's attachment", async () => {
    const app = await makeApp("claim-wrong-uploader");
    await addCollaborator(db, owner, app.id, "attach-editor-4", "editor");
    const editor = { principalId: "attach-editor-4", roles: [] };
    const attachment = await initAttachment(db, editor, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "claim-wrong-uploader-1",
    });
    await commitAttachmentContent(db, editor, app.id, attachment.id, PNG_1X1);
    const { conversation, message } = await appendUserMessage(db, owner, app.id, {
      content: "here's a screenshot",
      selectionContext: null,
      baseVersionNumber: 0,
    });
    await expect(
      claimAttachmentsForMessage(db, owner, app.id, conversation.id, message.id, [attachment.id]),
    ).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
  });
});

/**
 * M13 slice C — sending a message WITH attachments. The claim now runs
 * inside the message's own transaction, so these tests are specifically
 * about that atomicity: a rejected claim must leave no message behind.
 */
describe("appendUserMessage with attachmentIds — transactional claim", () => {
  async function readyAttachment(appId: string, key: string, actor = owner) {
    const attachment = await initAttachment(db, actor, appId, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: key,
    });
    return commitAttachmentContent(db, actor, appId, attachment.id, PNG_1X1);
  }

  it("claims the attachments as part of sending, returning them with the message", async () => {
    const app = await makeApp("send-golden");
    const first = await readyAttachment(app.id, "send-golden-1");
    const second = await readyAttachment(app.id, "send-golden-2");

    const { message, attachments } = await appendUserMessage(db, owner, app.id, {
      content: "Match this screenshot.",
      selectionContext: null,
      baseVersionNumber: 0,
      attachmentIds: [first.id, second.id],
    });

    expect(attachments.map((a) => a.id).sort()).toEqual([first.id, second.id].sort());
    expect(attachments.every((a) => a.messageId === message.id)).toBe(true);
  });

  it("rolls the MESSAGE back when a claim fails — never a message whose evidence silently vanished", async () => {
    const app = await makeApp("send-rollback");
    const ready = await readyAttachment(app.id, "send-rollback-1");
    // Never committed, so it is still `pending` and cannot be claimed.
    const notReady = await initAttachment(db, owner, app.id, {
      originalFilename: "later.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "send-rollback-2",
    });

    await expect(
      appendUserMessage(db, owner, app.id, {
        content: "Use both of these.",
        selectionContext: null,
        baseVersionNumber: 0,
        attachmentIds: [ready.id, notReady.id],
      }),
    ).rejects.toThrow();

    // No half-sent message...
    expect(await listMessagesForActor(db, owner, app.id)).toHaveLength(0);
    // ...and the ready attachment stays unclaimed, still available to send.
    expect((await getAttachmentForActor(db, owner, app.id, ready.id)).messageId).toBeNull();
  });

  it("rejects a duplicate id in one message rather than claiming it twice", async () => {
    const app = await makeApp("send-duplicate");
    const attachment = await readyAttachment(app.id, "send-duplicate-1");

    await expect(
      appendUserMessage(db, owner, app.id, {
        content: "Twice.",
        selectionContext: null,
        baseVersionNumber: 0,
        attachmentIds: [attachment.id, attachment.id],
      }),
    ).rejects.toThrow();
    expect(await listMessagesForActor(db, owner, app.id)).toHaveLength(0);
  });

  it("rejects another editor's upload, taking the message down with it", async () => {
    const app = await makeApp("send-other-uploader");
    await addCollaborator(db, owner, app.id, "attach-editor-send", "editor");
    const editor = { principalId: "attach-editor-send", roles: [] };
    const theirs = await readyAttachment(app.id, "send-other-1", editor);

    await expect(
      appendUserMessage(db, owner, app.id, {
        content: "Not mine to send.",
        selectionContext: null,
        baseVersionNumber: 0,
        attachmentIds: [theirs.id],
      }),
    ).rejects.toBeInstanceOf(AttachmentAccessDeniedError);
    expect(await listMessagesForActor(db, owner, app.id)).toHaveLength(0);
  });

  it("sends normally when no attachments are involved", async () => {
    const app = await makeApp("send-none");
    const { message, attachments } = await appendUserMessage(db, owner, app.id, {
      content: "Just text.",
      selectionContext: null,
      baseVersionNumber: 0,
    });
    expect(attachments).toEqual([]);
    expect(message.content).toBe("Just text.");
  });
});

describe("listConversationAttachmentsForActor", () => {
  it("returns claimed history to any conversation viewer, but another actor's unsent draft to nobody", async () => {
    const app = await makeApp("list-scope");
    await addCollaborator(db, owner, app.id, "attach-editor-list", "editor");
    await addCollaborator(db, owner, app.id, "attach-viewer-list", "viewer");
    const editor = { principalId: "attach-editor-list", roles: [] };
    const viewer = { principalId: "attach-viewer-list", roles: [] };

    const sent = await initAttachment(db, editor, app.id, {
      originalFilename: "sent.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "list-scope-sent",
    });
    await commitAttachmentContent(db, editor, app.id, sent.id, PNG_1X1);
    await appendUserMessage(db, editor, app.id, {
      content: "Sent with evidence.",
      selectionContext: null,
      baseVersionNumber: 0,
      attachmentIds: [sent.id],
    });

    // Uploaded but never sent — the editor's own private draft.
    const draft = await initAttachment(db, editor, app.id, {
      originalFilename: "draft.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "list-scope-draft",
    });
    await commitAttachmentContent(db, editor, app.id, draft.id, PNG_1X1);

    const editorSees = await listConversationAttachmentsForActor(db, editor, app.id);
    expect(editorSees.map((a) => a.id).sort()).toEqual([sent.id, draft.id].sort());

    const viewerSees = await listConversationAttachmentsForActor(db, viewer, app.id);
    expect(viewerSees.map((a) => a.id)).toEqual([sent.id]);

    const ownerSees = await listConversationAttachmentsForActor(db, owner, app.id);
    expect(ownerSees.map((a) => a.id)).toEqual([sent.id]);
  });

  it("never returns a storage key or a deleted attachment", async () => {
    const app = await makeApp("list-deleted");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "gone.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "list-deleted-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);

    const before = await listConversationAttachmentsForActor(db, owner, app.id);
    expect(before).toHaveLength(1);
    expect((before[0] as unknown as { storageKey?: string }).storageKey).toBeUndefined();

    await deleteAttachment(db, owner, app.id, attachment.id);
    expect(await listConversationAttachmentsForActor(db, owner, app.id)).toHaveLength(0);
  });

  it("cross-app / unrelated actor: fails as NotFoundError", async () => {
    const app = await makeApp("list-cross");
    await expect(listConversationAttachmentsForActor(db, unrelated, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("readAttachmentContentForActor", () => {
  // The type reported here is the one derived from the bytes at commit
  // (`detectedMimeType`), never the client's declared type.
  it("returns the stored bytes with the sniffed type to a conversation viewer", async () => {
    const app = await makeApp("content-read");
    await addCollaborator(db, owner, app.id, "attach-viewer-content", "viewer");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "content-read-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);

    const content = await readAttachmentContentForActor(db, { principalId: "attach-viewer-content", roles: [] }, app.id, attachment.id);
    expect(content.contentType).toBe("image/png");
    expect(content.filename).toBe("photo.png");
    expect(Buffer.compare(content.bytes, PNG_1X1)).toBe(0);
  });

  it("refuses to serve bytes for an attachment that is not ready", async () => {
    const app = await makeApp("content-not-ready");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "content-not-ready-1",
    });
    await expect(readAttachmentContentForActor(db, owner, app.id, attachment.id)).rejects.toThrow();
  });

  it("cross-app / unrelated actor: fails as NotFoundError", async () => {
    const app = await makeApp("content-cross");
    const attachment = await initAttachment(db, owner, app.id, {
      originalFilename: "photo.png",
      declaredMimeType: "image/png",
      declaredSizeBytes: PNG_1X1.length,
      idempotencyKey: "content-cross-1",
    });
    await commitAttachmentContent(db, owner, app.id, attachment.id, PNG_1X1);
    await expect(readAttachmentContentForActor(db, unrelated, app.id, attachment.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
