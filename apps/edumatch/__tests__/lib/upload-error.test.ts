import { describe, expect, it } from "vitest";
import { MAX_ERROR_CHARS, uploadErrorMessage } from "@/lib/upload-error";

/**
 * The message that motivated this helper: a Prisma P1000 surfaced through the
 * upload endpoint's dev-mode detail. Rendered verbatim it spilled far past the
 * attachment card. Note that its *first* line is a bundler chunk identifier —
 * the actual cause is the last line — which is why summarising a 5xx body is
 * not worth attempting.
 */
const PRISMA_P1000 = `
Invalid \`__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$client$2e$ts__["prisma"].eduStudentProfile.findUnique()\` invocation in
F:\\repos\\asafarim-platform\\apps\\edumatch\\.next\\dev\\server\\chunks\\[root-of-the-server]__0kz6kpq._.js:2166:170
  2163 return requireRole("ADMIN");
Authentication failed against the database server, the provided database credentials for \`asafarim\` are not valid
`.trim();

describe("uploadErrorMessage", () => {
  describe("server failures (5xx)", () => {
    it("defers to the generic message rather than echoing a Prisma dump", () => {
      expect(uploadErrorMessage(PRISMA_P1000, 500)).toBeNull();
    });

    it("defers for any 5xx, even with a tidy-looking body", () => {
      expect(uploadErrorMessage("Storage unreachable", 502)).toBeNull();
    });
  });

  describe("client failures (4xx)", () => {
    it("shows the server's message, which is the actionable part", () => {
      expect(uploadErrorMessage("File too large (max 50 MB)", 413)).toBe(
        "File too large (max 50 MB)",
      );
    });

    it("elides a first line that exceeds the budget", () => {
      const result = uploadErrorMessage("x".repeat(MAX_ERROR_CHARS + 50), 400);

      expect(result).toContain("…");
      expect(result!.length).toBeLessThanOrEqual(MAX_ERROR_CHARS + 1);
    });

    it("keeps the response to a single line", () => {
      const result = uploadErrorMessage("Unsupported type\nstack frame\nmore", 415);

      expect(result).toBe("Unsupported type");
    });

    it("skips leading blank lines to find the real message", () => {
      expect(uploadErrorMessage("\n\n  Unsupported type  ", 415)).toBe(
        "Unsupported type",
      );
    });

    it("defers when the body carries no usable text", () => {
      expect(uploadErrorMessage("   \n\n  ", 400)).toBeNull();
      expect(uploadErrorMessage(undefined, 400)).toBeNull();
    });
  });
});
