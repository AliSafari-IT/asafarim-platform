import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { testCases } from "@/db/schema";
import { setCaseQuarantine } from "@/lib/flake-service";

const updateSchema = z
  .object({
    title: z.string().min(1).optional(),
    fixtureId: z.string().min(1).optional(),
    scriptType: z.enum(["single", "multi", "scripted"]).optional(),
    input: z.record(z.unknown()).optional(),
    runs: z.array(z.record(z.unknown())).optional(),
    expected: z.record(z.unknown()).optional(),
    script: z.string().optional(),
    // Manual quarantine (issue #260) — always available, always overrides
    // auto-quarantine. Handled separately below (it also stamps
    // quarantinedAt/quarantineReason).
    quarantined: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scriptType === "single" && !value.input) {
      ctx.addIssue({ code: "custom", message: "Single-run cases require input.", path: ["input"] });
    }
    if (value.scriptType === "multi" && (!value.runs || value.runs.length === 0)) {
      ctx.addIssue({ code: "custom", message: "Multi-run cases require at least one run.", path: ["runs"] });
    }
    if (value.scriptType === "scripted" && !value.script?.trim()) {
      ctx.addIssue({ code: "custom", message: "Scripted cases require a script body.", path: ["script"] });
    }
  });

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { quarantined, ...rest } = parsed.data;

  try {
    let updated = Object.keys(rest).length
      ? (
          await db
            .update(testCases)
            .set({ ...rest, updatedAt: new Date() })
            .where(eq(testCases.caseId, caseId))
            .returning()
        )[0]
      : await db.query.testCases.findFirst({ where: eq(testCases.caseId, caseId) });

    if (!updated) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    if (quarantined !== undefined) {
      updated = (await setCaseQuarantine(caseId, quarantined)) ?? updated;
    }
    return NextResponse.json({ testCase: updated });
  } catch (error) {
    return NextResponse.json(
      { error: isForeignKeyViolation(error) ? "Target fixture does not exist." : "Failed to update case" },
      { status: isForeignKeyViolation(error) ? 400 : 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const [deleted] = await db.delete(testCases).where(eq(testCases.caseId, caseId)).returning();

  if (!deleted) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function isForeignKeyViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23503");
}
