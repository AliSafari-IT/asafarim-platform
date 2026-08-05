import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  attachmentSchema,
  inquiryIntakeSchema,
  presignRequestSchema,
} from "@/lib/server/validation";

const OFFICE_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

describe("validation — file constraints", () => {
  it("includes the Microsoft Office document types", () => {
    for (const mime of OFFICE_TYPES) {
      expect(ALLOWED_MIME_TYPES).toContain(mime);
    }
  });

  describe("presignRequestSchema", () => {
    it("accepts a valid Word document request", () => {
      const result = presignRequestSchema.safeParse({
        filename: "assignment.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1024,
      });
      expect(result.success).toBe(true);
    });

    it("rejects an unsupported MIME type", () => {
      const result = presignRequestSchema.safeParse({
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 1024,
      });
      expect(result.success).toBe(false);
    });

    it("rejects files larger than the 50 MB cap", () => {
      const result = presignRequestSchema.safeParse({
        filename: "huge.pdf",
        contentType: "application/pdf",
        sizeBytes: MAX_FILE_BYTES + 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects filenames with path-traversal characters", () => {
      const result = presignRequestSchema.safeParse({
        filename: "../../etc/passwd",
        contentType: "text/plain",
        sizeBytes: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("attachmentSchema", () => {
    it("accepts a fully-formed attachment", () => {
      const result = attachmentSchema.safeParse({
        key: "inquiries/user-1/abc/photo.png",
        url: "https://cdn.example.com/inquiries/user-1/abc/photo.png",
        mime: "image/png",
        sizeBytes: 2048,
        filename: "photo.png",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a non-URL url", () => {
      const result = attachmentSchema.safeParse({
        key: "inquiries/user-1/abc/photo.png",
        url: "not-a-url",
        mime: "image/png",
        sizeBytes: 2048,
        filename: "photo.png",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("inquiryIntakeSchema", () => {
    const base = {
      subject: "Physics",
      gradeLevel: "K12" as const,
      description: "Please help me with this kinematics problem set.",
    };

    it("defaults attachments to an empty array", () => {
      const result = inquiryIntakeSchema.safeParse(base);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.attachments).toEqual([]);
    });

    it("rejects more than 5 attachments", () => {
      const att = {
        key: "inquiries/user-1/abc/photo.png",
        url: "https://cdn.example.com/photo.png",
        mime: "image/png" as const,
        sizeBytes: 2048,
        filename: "photo.png",
      };
      const result = inquiryIntakeSchema.safeParse({
        ...base,
        attachments: Array.from({ length: 6 }, () => att),
      });
      expect(result.success).toBe(false);
    });
  });
});
