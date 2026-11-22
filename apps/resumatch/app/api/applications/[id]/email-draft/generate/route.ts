import { NextResponse } from "next/server";
import { generateApplicationEmail } from "../../../../../../lib/applicationEmail/ai/generate";
import { CONTACT_NAME_MAX_LENGTH } from "../../../../../../lib/applicationEmail/normalize";
import { isContactMode, parseContactPreferences, type ContactMode, type ContactPreferences } from "../../../../../../lib/contactPreferences/contract";
import { logError } from "../../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../../lib/workspace";

export const dynamic = "force-dynamic";

const ERRORS = {
  not_found: [404, "This application no longer exists."],
  no_documents: [409, "This application needs a tailored CV with a cover letter first."],
  budget: [429, "This month's AI budget is used up, so no new text was written. Your text is unchanged."],
  failed: [502, "The AI couldn't write the email right now. Your text is unchanged; try again in a moment."],
  nothing_left: [502, "The AI's draft didn't pass the fact check. Your text is unchanged; try again or write it yourself."],
} as const;

/**
 * Write a subject and message with the AI. Returns text only and stores
 * nothing: the composer decides whether it replaces what is in the fields,
 * so hand edits are never overwritten unasked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let contactName: string | null = null;
  let contact: { mode: ContactMode; override: ContactPreferences | null } | undefined;
  try {
    const body = (await request.json()) as { contactName?: unknown; contactMode?: unknown; contactOverride?: unknown } | null;
    if (typeof body?.contactName === "string") contactName = body.contactName.slice(0, CONTACT_NAME_MAX_LENGTH);
    if (isContactMode(body?.contactMode)) {
      let override: ContactPreferences | null = null;
      if (body.contactMode === "OVERRIDE") {
        const parsed = parseContactPreferences(body.contactOverride);
        if (!parsed.ok) return NextResponse.json({ error: "Invalid contact preferences", code: "contact_preferences" }, { status: 422 });
        override = parsed.value;
      }
      contact = { mode: body.contactMode, override };
    }
  } catch {
    // No body is fine.
  }

  try {
    const result = await generateApplicationEmail(workspace.id, id, { contactName, contact });
    if (!result.ok) {
      const [status, error] = ERRORS[result.reason];
      return NextResponse.json({ error, code: result.reason }, { status });
    }
    return NextResponse.json({ subject: result.subject, body: result.body, removed: result.removed, language: result.language, contactParagraph: result.contactParagraph });
  } catch (error) {
    logError("application_email.generate_failed", error, { applicationId: id });
    return NextResponse.json({ error: ERRORS.failed[1], code: "failed" }, { status: 500 });
  }
}
