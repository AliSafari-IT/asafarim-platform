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
} from "./attachments";
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
