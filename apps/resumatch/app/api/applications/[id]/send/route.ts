import { NextResponse } from "next/server";
import { z } from "zod";
import { sendRequestSchema } from "../../../../../lib/applicationEmail/normalize";
import { sendApplicationEmail } from "../../../../../lib/applicationEmail/service";
import { logError } from "../../../../../lib/observability/logger";
import { getCurrentWorkspace, getSessionAccountInfo } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = sendRequestSchema.extend({ confirmResend: z.boolean().optional() });

const INVALID_STATUS: Record<string, number> = {
  not_found: 404,
  not_configured: 503,
  fields: 422,
  attachments: 422,
  attachment_unreadable: 422,
  draft_conflict: 409,
  unresolved_send: 409,
  rate_limited: 429,
  no_reply_address: 422,
  key_reused: 409,
};

/**
 * Send the application email, on the candidate's explicit click only.
 * See lib/applicationEmail/service.ts for the idempotency and status rules.
 * The response always says which of accepted / failed / uncertain /
 * in_progress happened; for an invalid request, why. It never echoes the
 * message, and nothing about its content is logged.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", outcome: "invalid", reason: "fields" }, { status: 400 });

  const account = await getSessionAccountInfo();
  try {
    const result = await sendApplicationEmail(workspace.id, id, parsed.data, {
      accountEmail: account.email,
      accountName: account.fullName,
    });
    if (result.outcome === "invalid") return NextResponse.json(result, { status: INVALID_STATUS[result.reason] ?? 400 });
    if (result.outcome === "in_progress") return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Reached only before the provider call (the send itself never throws),
    // so nothing was sent.
    logError("application_email.send_route_failed", error, { applicationId: id });
    return NextResponse.json({ outcome: "error", error: "Something went wrong before sending. Nothing was sent." }, { status: 500 });
  }
}
