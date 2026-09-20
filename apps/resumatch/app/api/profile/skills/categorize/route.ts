import { NextResponse } from "next/server";
import { categorizeSkillsWithFallback } from "../../../../../lib/profile/ai/categorize/degraded";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Preview AI-suggested skill categories. This never touches the saved
 * profile — it only returns suggestions; the candidate accepts them
 * client-side (all at once, or per skill) the same way a Summary rewrite
 * is accepted, and they become real only once Save is pressed.
 *
 * Only skill *names* are sent — no employer, date, or other profile field
 * reaches the prompt (see lib/profile/ai/categorize/prompts.ts).
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

  const { skillNames } = (body ?? {}) as { skillNames?: unknown };
  if (!Array.isArray(skillNames) || skillNames.some((name) => typeof name !== "string")) {
    return NextResponse.json({ error: "skillNames must be an array of strings." }, { status: 400 });
  }
  const names = (skillNames as string[]).filter((name) => name.trim().length > 0);
  if (names.length === 0) {
    return NextResponse.json({ error: "There are no skills to categorize yet." }, { status: 400 });
  }

  const { suggestions, degraded } = await categorizeSkillsWithFallback(workspace.id, names);

  return NextResponse.json({
    // Map isn't JSON-serializable directly — sent as an array of pairs,
    // already filtered by mergeSuggestedCategories to only ever name a
    // skill the candidate actually has.
    categories: [...suggestions.entries()].map(([name, category]) => ({ name, category })),
    degraded,
  });
}
