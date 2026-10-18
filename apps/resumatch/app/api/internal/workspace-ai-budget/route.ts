import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getWorkspaceBudget,
  setWorkspaceBudget,
  workspaceBudgetUpdateSchema,
} from "@/lib/ai/workspaceBudget";

/**
 * Per-workspace AI monthly budget override (issue #514), operator-facing.
 *
 *   GET /api/internal/workspace-ai-budget?workspaceId=…
 *     → { workspaceId, monthUsd, budgetUsd, budgetSource, overrideUsd }
 *   PUT /api/internal/workspace-ai-budget  { workspaceId, budgetUsd: number | null }
 *     → the same shape after the change; `null` clears the override.
 *
 * Carries no session: like app/api/internal/{ai-spend,audit-events}, it
 * authenticates a bearer `INTERNAL_API_SECRET` in constant time and 404s
 * when the secret is unset or wrong, and is listed in proxy.ts
 * publicRoutes for that reason. A candidate can never reach it, so a
 * workspace can't raise its own ceiling.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const presented = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );
  const presentedBuf = Buffer.from(presented);
  const secretBuf = Buffer.from(secret);
  if (presentedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(presentedBuf, secretBuf);
}

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(request: Request) {
  if (!isAuthorized(request)) return notFound();

  const workspaceId = new URL(request.url).searchParams
    .get("workspaceId")
    ?.trim();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 }
    );
  }
  const view = await getWorkspaceBudget(workspaceId);
  if (!view)
    return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  return NextResponse.json(view);
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = workspaceBudgetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const view = await setWorkspaceBudget(parsed.data);
  if (!view)
    return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  return NextResponse.json(view);
}
