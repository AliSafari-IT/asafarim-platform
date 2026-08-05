import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildAttachmentKey,
  createPresignedUploadUrl,
  isKeyOwnedBy,
} from "../storage";

describe("buildAttachmentKey", () => {
  it("namespaces by user id", () => {
    const key = buildAttachmentKey("u-1", "math.png");
    expect(key.startsWith("inquiries/u-1/")).toBe(true);
    expect(key.endsWith("/math.png")).toBe(true);
  });

  it("sanitises unsafe characters in the filename", () => {
    const key = buildAttachmentKey("u-1", "../../etc passwd!.txt");
    // No path traversal, no spaces, no shell metacharacters in the suffix.
    const suffix = key.split("/").pop() ?? "";
    expect(suffix).not.toContain("..");
    expect(suffix).not.toContain(" ");
    expect(suffix).not.toContain("!");
  });

  it("produces a unique key per call", () => {
    const a = buildAttachmentKey("u-1", "foo.png");
    const b = buildAttachmentKey("u-1", "foo.png");
    expect(a).not.toBe(b);
  });
});

describe("isKeyOwnedBy", () => {
  it("accepts keys minted for the same user", () => {
    const key = buildAttachmentKey("u-1", "math.png");
    expect(isKeyOwnedBy(key, "u-1")).toBe(true);
  });

  it("rejects keys minted for another user", () => {
    const key = buildAttachmentKey("u-1", "math.png");
    expect(isKeyOwnedBy(key, "u-2")).toBe(false);
  });
});

describe("createPresignedUploadUrl (local-dev stub)", () => {
  const SPACES_VARS = [
    "SPACES_ENDPOINT",
    "SPACES_REGION",
    "SPACES_BUCKET",
    "SPACES_ACCESS_KEY",
    "SPACES_SECRET_KEY",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of SPACES_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of SPACES_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns a stub when storage env vars are absent", async () => {
    const presigned = await createPresignedUploadUrl({
      userId: "u-1",
      filename: "homework.png",
      contentType: "image/png",
      sizeBytes: 1024,
    });
    expect(presigned.isLocalStub).toBe(true);
    expect(presigned.uploadUrl.startsWith("local-stub://")).toBe(true);
    expect(presigned.headers["Content-Type"]).toBe("image/png");
    expect(presigned.key.startsWith("inquiries/u-1/")).toBe(true);
  });
});
