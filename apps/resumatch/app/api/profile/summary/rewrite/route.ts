import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { rewriteSummaryWithFallback } from "../../../../../lib/profile/ai/degraded";
import { MAX_INSTRUCTIONS_LENGTH } from "../../../../../lib/profile/ai/prompts";
import { SUMMARY_TONES, type SummaryTone } from "../../../../../lib/profile/ai/provider";
import { ProtectedAttributeError, parseProfileContent } from "../../../../../lib/profile/contract";
import { buildProfileText } from "../../../../../lib/tailoring/buildProfileText";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

function isSummaryTone(value: unknown): value is SummaryTone {
  return typeof value === "string" && (SUMMARY_TONES as readonly string[]).includes(value);
}

/**
 * Preview a Summary written (when the field is empty) or rewritten from the
 * candidate's profile, in a chosen tone, optionally steered by a short
 * free-text request. This never touches the saved profile — it only returns
 * a suggestion; the candidate accepts it client-side by setting the form
 * field, and it becomes real only once they Save (and, per the rest of this
 * app's posture, Confirm).
 *
 * The profile comes from the form as it stands, unsaved edits included, so
 * the suggestion matches what the candidate sees. Contact fields are blanked
 * before parsing: they never reach the prompt (see buildProfileText), and a
 * half-typed email should not block writing a summary.
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

  const { profile, tone, instructions } = (body ?? {}) as {
    profile?: unknown;
    tone?: unknown;
    instructions?: unknown;
  };

  if (!isSummaryTone(tone)) {
    return NextResponse.json({ error: `Tone must be one of: ${SUMMARY_TONES.join(", ")}.` }, { status: 400 });
  }
  if (instructions !== undefined && instructions !== null && typeof instructions !== "string") {
    return NextResponse.json({ error: "Instructions must be text." }, { status: 400 });
  }
  if (typeof instructions === "string" && instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return NextResponse.json(
      { error: `Instructions can be at most ${MAX_INSTRUCTIONS_LENGTH} characters.`, code: "instructions_too_long" },
      { status: 400 },
    );
  }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return NextResponse.json({ error: "A profile is required." }, { status: 400 });
  }

  let content;
  try {
    content = parseProfileContent({ ...profile, fullName: null, email: null, phone: null, baseLocation: null });
  } catch (error) {
    if (error instanceof ZodError || error instanceof ProtectedAttributeError) {
      return NextResponse.json(
        { error: "Some profile entries are not valid yet. Fix them, then try again.", code: "invalid_profile" },
        { status: 400 },
      );
    }
    throw error;
  }

  const currentSummary = content.summary?.trim() ?? "";
  const { text: profileText } = buildProfileText({ ...content, summary: null });
  if (!currentSummary && !profileText.trim()) {
    return NextResponse.json(
      { error: "Add a headline, a role, or some skills first, so there is something to write from.", code: "empty_profile" },
      { status: 400 },
    );
  }

  const result = await rewriteSummaryWithFallback(workspace.id, {
    currentSummary,
    profileText,
    tone,
    instructions: typeof instructions === "string" ? instructions : undefined,
  });
  return NextResponse.json({ rewritten: result.text, degraded: result.degraded });
}
