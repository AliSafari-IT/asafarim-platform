import { NextResponse } from "next/server";
import { z } from "zod";
import { isProjectViewable } from "@/lib/app-access";
import { generateIssueDraft } from "@/lib/ai-issue";
import type { IssueFacts } from "@/lib/issue-template";

// Draft issue text for a failed result, using AI when OPENAI_API_KEY is set and
// otherwise the deterministic template. Server-side so the key stays private.
const schema = z.object({
  projectId: z.string().min(1),
  caseTitle: z.string().default(""),
  fixtureTitle: z.string().default(""),
  suiteTitle: z.string().default(""),
  frTitle: z.string().default(""),
  status: z.string().default("failed"),
  errorMessage: z.string().nullable().default(null),
  targetBaseUrl: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  createdAt: z.string().default(() => new Date().toISOString()),
  hasScreenshot: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  // The Results page is already gated server-side; mirror that here so a locked
  // private app's failure text isn't drafted for an unauthorized viewer.
  if (!(await isProjectViewable(data.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }

  const facts: IssueFacts = {
    caseTitle: data.caseTitle,
    fixtureTitle: data.fixtureTitle,
    suiteTitle: data.suiteTitle,
    frTitle: data.frTitle,
    status: data.status,
    targetBaseUrl: data.targetBaseUrl,
    durationMs: data.durationMs,
    createdAt: data.createdAt,
    errorMessage: data.errorMessage,
    // buildIssueDraft / the AI generator only check truthiness of `screenshot`.
    screenshot: data.hasScreenshot ? "yes" : null,
  };

  const draft = await generateIssueDraft(facts);
  return NextResponse.json(draft);
}
