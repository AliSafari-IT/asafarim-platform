import { NextResponse } from "next/server";
import { feedbackSubmissionSchema } from "../../../lib/feedback/contract";
import { checkRateLimit } from "../../../lib/search/rateLimit";
import { listFeedbackForWorkspace, submitFeedback } from "../../../lib/feedback/service";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Relevance feedback submission (JM-059).
 *
 * Rate-limited under its own key, separate from search's budget: a
 * feedback form is a much lower-frequency action than a search keystroke,
 * so it gets its own tighter window rather than borrowing search's.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const items = await listFeedbackForWorkspace(workspace.id);
  return NextResponse.json({ items });
}

const FEEDBACK_MAX_PER_WINDOW = 10;

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const limit = checkRateLimit(`feedback:${workspace.id}`, Date.now(), FEEDBACK_MAX_PER_WINDOW);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too much feedback submitted at once. Slow down and try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = feedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That feedback could not be understood." }, { status: 400 });
  }

  const result = await submitFeedback(workspace.id, parsed.data);
  if (!result.ok) {
    const status = result.reasonCode === "POSTING_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.reasonCode }, { status });
  }
  return NextResponse.json({ record: result.record });
}
