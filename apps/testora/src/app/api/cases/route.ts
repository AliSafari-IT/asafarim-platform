import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { testCases } from "@/db/schema";

const createSchema = z
  .object({
    caseId: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
    fixtureId: z.string().min(1),
    title: z.string().min(1),
    scriptType: z.enum(["single", "multi", "scripted"]),
    input: z.record(z.unknown()).optional(),
    runs: z.array(z.record(z.unknown())).optional(),
    expected: z.record(z.unknown()).default({}),
    script: z.string().optional(),
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

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [testCase] = await db.insert(testCases).values(parsed.data).returning();
    return NextResponse.json({ testCase }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: isUniqueViolation(error) ? `A case with id "${parsed.data.caseId}" already exists.` : "Failed to create case" },
      { status: isUniqueViolation(error) ? 409 : 500 },
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
