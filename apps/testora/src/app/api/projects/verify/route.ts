import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { newVerificationToken, verificationRecord, WELL_KNOWN_PATH } from "@/lib/ownership";
import { verifyOwnership } from "@/lib/ownership-verify";
import { canManageCatalog } from "@/lib/viewer-role";

// Ownership verification for an app's site (#703). Admin-only: the proxy
// refuses members/testers (not a member or tester write) and this re-checks.
// POST ?id=<app> checks the well-known file / DNS TXT record for the app's
// token and, when found, marks the app verified.
export async function POST(request: Request) {
  if (!(await canManageCatalog())) {
    return NextResponse.json({ error: "Only admins can verify an app." }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing app id" }, { status: 400 });

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (project.seeded) return NextResponse.json({ verified: true, detail: "Built-in apps are pre-verified." });

  let host: string;
  try {
    host = new URL(project.baseUrl).hostname;
  } catch {
    return NextResponse.json({ error: "Set the app's site URL before verifying it." }, { status: 400 });
  }

  // Older apps may predate tokens: issue one now (the operator publishes it next).
  let token = project.verificationToken;
  if (!token) {
    token = newVerificationToken();
    await db.update(projects).set({ verificationToken: token }).where(eq(projects.id, id));
  }

  const result = await verifyOwnership(host, token);
  if (!result.verified) {
    return NextResponse.json(
      {
        verified: false,
        detail: result.detail,
        instructions: `Publish "${verificationRecord(token)}" at https://${host}${WELL_KNOWN_PATH} or as a DNS TXT record on ${host}, then try again.`,
      },
      { status: 409 },
    );
  }
  // Only mark verified if the app still has the URL and token that passed the
  // proof — an edit while the check ran must not inherit it (TOCTOU).
  const verifiedAt = new Date();
  const marked = await db
    .update(projects)
    .set({ verifiedAt, updatedAt: verifiedAt })
    .where(
      and(
        eq(projects.id, id),
        eq(projects.baseUrl, project.baseUrl),
        eq(projects.verificationToken, token),
      ),
    )
    .returning({ id: projects.id });
  if (marked.length === 0) {
    return NextResponse.json(
      { verified: false, detail: "The app's site URL or token changed while it was being checked — verify again." },
      { status: 409 },
    );
  }
  return NextResponse.json({ verified: true, method: result.method, verifiedAt, detail: result.detail });
}
