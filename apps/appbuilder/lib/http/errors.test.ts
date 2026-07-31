import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validationErrorResponse } from "./errors";

/**
 * Before this helper existed, every route that failed `safeParse` returned
 * one hardcoded string (e.g. "Invalid clarification submission.") regardless
 * of which field or constraint actually failed — undiagnosable from the
 * client alone. This is what replaced that: the real Zod issue, safe to
 * expose because it only ever describes the caller's own request shape
 * against a server-authored schema.
 */
describe("validationErrorResponse", () => {
  const Schema = z.object({
    roundNumber: z.number().int().min(1),
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1).max(64),
          answer: z.string().min(1).max(2000),
        }),
      )
      .min(1)
      .max(20),
  });

  it("names the field and constraint for an answer that is too long", async () => {
    const result = Schema.safeParse({
      roundNumber: 1,
      answers: [{ questionId: "Q1", answer: "x".repeat(2001) }],
    });
    expect(result.success).toBe(false);
    const res = validationErrorResponse(result.error!);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("validation_error");
    expect(body.error).toMatch(/^answers\.0\.answer:/);
    expect(body.issues).toHaveLength(1);
  });

  it("reports every failing field, not just the first", async () => {
    const result = Schema.safeParse({ roundNumber: 0, answers: [] });
    expect(result.success).toBe(false);
    const res = validationErrorResponse(result.error!);
    const body = await res.json();
    expect(body.issues.some((i: string) => i.startsWith("roundNumber:"))).toBe(true);
    expect(body.issues.some((i: string) => i.startsWith("answers:"))).toBe(true);
  });

  it("falls back to a generic message only when there are somehow no issues at all", async () => {
    const res = validationErrorResponse({ issues: [] } as unknown as z.ZodError);
    const body = await res.json();
    expect(body.error).toBe("Invalid request.");
  });
});
