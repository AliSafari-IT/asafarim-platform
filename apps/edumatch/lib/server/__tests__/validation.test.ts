import { describe, it, expect } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  attachmentSchema,
  avatarPresignRequestSchema,
  avatarSelectSchema,
  formatZodError,
  inquiryIntakeSchema,
  presignRequestSchema,
  studentProfilePatchSchema,
  studentProfileSchema,
} from "../validation";

describe("presignRequestSchema", () => {
  it("accepts a valid PNG under the size limit", () => {
    const result = presignRequestSchema.safeParse({
      filename: "homework.png",
      contentType: "image/png",
      sizeBytes: 1_024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a disallowed MIME type", () => {
    const result = presignRequestSchema.safeParse({
      filename: "evil.exe",
      contentType: "application/x-msdownload",
      sizeBytes: 1_024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects files larger than the cap", () => {
    const result = presignRequestSchema.safeParse({
      filename: "big.mp4",
      contentType: "video/mp4",
      sizeBytes: MAX_FILE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects path-traversal filenames", () => {
    const result = presignRequestSchema.safeParse({
      filename: "../../etc/passwd",
      contentType: "text/plain",
      sizeBytes: 32,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty files", () => {
    const result = presignRequestSchema.safeParse({
      filename: "empty.png",
      contentType: "image/png",
      sizeBytes: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("attachmentSchema", () => {
  it("requires a valid URL", () => {
    const result = attachmentSchema.safeParse({
      key: "inquiries/u1/abc/foo.png",
      url: "not-a-url",
      mime: "image/png",
      sizeBytes: 100,
      filename: "foo.png",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a stub URL scheme (local-dev)", () => {
    // The schema only checks shape — the create endpoint enforces ownership.
    const result = attachmentSchema.safeParse({
      key: "inquiries/u1/abc/foo.png",
      url: "https://cdn.example.com/inquiries/u1/abc/foo.png",
      mime: "image/png",
      sizeBytes: 100,
      filename: "foo.png",
    });
    expect(result.success).toBe(true);
  });
});

describe("inquiryIntakeSchema", () => {
  const valid = {
    subject: "Math",
    gradeLevel: "K12",
    description: "Need help with algebra problem 4.",
    attachments: [],
  };

  it("accepts a minimal valid payload", () => {
    expect(inquiryIntakeSchema.safeParse(valid).success).toBe(true);
  });

  it("requires subject of at least 2 chars", () => {
    expect(
      inquiryIntakeSchema.safeParse({ ...valid, subject: "x" }).success,
    ).toBe(false);
  });

  it("requires description of at least 10 chars", () => {
    expect(
      inquiryIntakeSchema.safeParse({ ...valid, description: "short" }).success,
    ).toBe(false);
  });

  it("rejects unknown grade levels", () => {
    expect(
      inquiryIntakeSchema.safeParse({ ...valid, gradeLevel: "PRESCHOOL" }).success,
    ).toBe(false);
  });

  it("caps attachments at 5", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      key: `inquiries/u1/k${i}/f.png`,
      url: "https://cdn.example.com/x",
      mime: "image/png" as const,
      sizeBytes: 10,
      filename: "f.png",
    }));
    expect(
      inquiryIntakeSchema.safeParse({ ...valid, attachments: six }).success,
    ).toBe(false);
  });

  it("trims whitespace from subject and description", () => {
    const parsed = inquiryIntakeSchema.parse({
      ...valid,
      subject: "  Math  ",
      description: "  Need help with algebra problem 4.  ",
    });
    expect(parsed.subject).toBe("Math");
    expect(parsed.description).toBe("Need help with algebra problem 4.");
  });
});

describe("formatZodError", () => {
  it("flattens issues into a stable, human-readable string", () => {
    const result = inquiryIntakeSchema.safeParse({
      subject: "x",
      gradeLevel: "K12",
      description: "short",
    });
    if (result.success) throw new Error("expected failure");
    const msg = formatZodError(result.error);
    expect(msg).toMatch(/subject/);
    expect(msg).toMatch(/description/);
    expect(msg.includes(";")).toBe(true);
  });
});

describe("ALLOWED_MIME_TYPES", () => {
  it("covers the three big buckets from the project plan", () => {
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES).toContain("video/mp4");
    expect(ALLOWED_MIME_TYPES).toContain("audio/wav");
  });
});

describe("studentProfileSchema — dateOfBirth", () => {
  const base = { gradeLevel: "K12" as const, subjectsOfInterest: [] };

  it("is optional to create a profile", () => {
    expect(studentProfileSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a date-only string", () => {
    const parsed = studentProfileSchema.safeParse({ ...base, dateOfBirth: "2013-08-11" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.dateOfBirth).toBeInstanceOf(Date);
  });

  it("accepts a full ISO datetime string", () => {
    expect(
      studentProfileSchema.safeParse({ ...base, dateOfBirth: "2013-08-11T00:00:00Z" }).success,
    ).toBe(true);
  });

  it("rejects a date of birth in the future", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(studentProfileSchema.safeParse({ ...base, dateOfBirth: future }).success).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(
      studentProfileSchema.safeParse({ ...base, dateOfBirth: "not-a-date" }).success,
    ).toBe(false);
  });

  it("stays optional in the PATCH (partial) schema", () => {
    expect(studentProfilePatchSchema.safeParse({}).success).toBe(true);
    expect(
      studentProfilePatchSchema.safeParse({ dateOfBirth: "2013-08-11" }).success,
    ).toBe(true);
  });
});

describe("avatarPresignRequestSchema", () => {
  it("accepts a small image under the 2 MB avatar cap", () => {
    expect(
      avatarPresignRequestSchema.safeParse({
        filename: "selfie.jpg",
        contentType: "image/jpeg",
        sizeBytes: 500_000,
      }).success,
    ).toBe(true);
  });

  it("rejects a file over the avatar size cap even though it's under the general cap", () => {
    expect(
      avatarPresignRequestSchema.safeParse({
        filename: "big.png",
        contentType: "image/png",
        sizeBytes: 3 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-image MIME type", () => {
    expect(
      avatarPresignRequestSchema.safeParse({
        filename: "doc.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      }).success,
    ).toBe(false);
  });
});

describe("avatarSelectSchema", () => {
  it("accepts a preset selection", () => {
    expect(avatarSelectSchema.safeParse({ type: "preset", id: "cosmo" }).success).toBe(true);
  });

  it("accepts an upload selection with a key and public URL", () => {
    expect(
      avatarSelectSchema.safeParse({
        type: "upload",
        key: "avatars/u-1/abc/photo.jpg",
        publicUrl: "https://cdn.example.com/avatars/u-1/abc/photo.jpg",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown discriminant", () => {
    expect(avatarSelectSchema.safeParse({ type: "url", value: "x" }).success).toBe(false);
  });
});
