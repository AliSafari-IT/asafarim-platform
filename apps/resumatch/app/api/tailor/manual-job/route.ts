import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { MAX_EXTRACTED_CHARACTERS, MIN_USEFUL_CHARACTERS } from "../../../../lib/tailoring/fetchJob";
import { buildManualJobText, manualJobInputSchema } from "../../../../lib/tailoring/manualJob";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Accept a fully typed-by-hand job lead — a phone call, a printed letter, a
 * career-fair conversation — as a fourth alternative to fetch-job/paste-job/
 * paste-email/upload-job (issue #461, part of #458). No extraction of any
 * kind: the candidate is the only source, so this is pure structured-input
 * validation plus concatenation into the same `rawText` shape every other
 * intake path already produces.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let input;
  try {
    input = manualJobInputSchema.parse(body);
  } catch {
    return NextResponse.json(
      { error: "Fill in the job title, employer, and at least one of responsibilities, requirements, preferred qualifications, or benefits." },
      { status: 400 },
    );
  }

  const rawText = buildManualJobText(input).slice(0, MAX_EXTRACTED_CHARACTERS);
  if (rawText.length < MIN_USEFUL_CHARACTERS) {
    return NextResponse.json(
      { error: `Add a bit more detail — at least ${MIN_USEFUL_CHARACTERS} characters total is needed to tailor toward this role.` },
      { status: 400 },
    );
  }

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.create({
    data: {
      workspaceId: workspace.id,
      // No fetch, no pasted source — same sentinel pattern as the other
      // non-URL intake paths (see #458).
      sourceUrl: "manual://job-entry",
      rawText,
      title: input.title,
      employer: input.employer,
      structuredFields: input,
      status: "FETCHED",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: input.title,
    employer: input.employer,
    snippet: rawText.slice(0, 400),
  });
}
