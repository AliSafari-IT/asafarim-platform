import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, unauthorized, serverError } from "@/lib/server/auth";
import { formatZodError, addChildSchema } from "@/lib/server/validation";
import { addChildProfile, listChildren, ParentError } from "@/lib/server/parent";

export const runtime = "nodejs";

/**
 * GET /api/parent/children
 *
 * List the caller's managed children. Empty (not an error) for a parent
 * with no children yet — the dashboard shows an "add your first child"
 * empty state.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const children = await listChildren(user.id);
    return NextResponse.json({ children });
  } catch (error) {
    return serverError("parent/children GET", error);
  }
}

/**
 * POST /api/parent/children
 *
 * Add a child. Requires the caller to already be a registered parent
 * (POST /api/parent/profile) — this route doesn't silently register them,
 * since "I am a parent" is a deliberate onboarding choice, not a side
 * effect of a form submit.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = addChildSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const child = await addChildProfile(user.id, parsed.data);
    return NextResponse.json(child, { status: 201 });
  } catch (error) {
    if (error instanceof ParentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("parent/children POST", error);
  }
}
