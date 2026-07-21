import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { createApp, listCatalogForActor } from "@/lib/repositories/apps";
import { listCatalogMetadata } from "@/lib/repositories/appOverview";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { normalizeCatalogQuery } from "@/lib/validation/catalogQuery";
import { slugify, validateCreateAppInput } from "@/lib/validation/createApp";

/**
 * The signed-in actor's catalog page (owned + collaborated apps), scoped
 * entirely inside `listCatalogForActor` — never an unscoped "list all" plus
 * client-side filtering. Query params are normalized server-side with safe
 * fallbacks (lib/validation/catalogQuery.ts); malformed values never reach
 * the repository layer as-is.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const url = new URL(request.url);
  const query = normalizeCatalogQuery({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    access: url.searchParams.get("access") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
  });

  const db = getDb();
  const result = await listCatalogForActor(db, actor, query);
  const metadata = await listCatalogMetadata(db, result.rows.map((row) => row.app.id));

  return NextResponse.json({
    apps: result.rows.map((row) => ({
      ...row,
      metadata: metadata.get(row.app.id) ?? null,
    })),
    totalCount: result.totalCount,
    page: result.page,
    pageSize: result.pageSize,
  });
}

/**
 * Creates an app owned by the signed-in actor, atomically with its initial
 * specification/version, creation-intent record, and audit event (see
 * lib/repositories/apps.ts#createApp). `ownerPrincipalId` always comes from
 * the session, never the request body. Requires `idempotencyKey` so a
 * retried/duplicated submission never creates a second app.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body || typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8) {
    return NextResponse.json({ error: "A valid idempotencyKey is required" }, { status: 400 });
  }

  const validated = validateCreateAppInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: validated.fieldErrors }, { status: 422 });
  }

  try {
    const app = await createApp(
      getDb(),
      actor,
      {
        name: validated.data.name,
        slug: slugify(validated.data.name),
        description: validated.data.prompt.slice(0, 2000),
        prompt: validated.data.prompt,
        starterFamily: validated.data.starterFamily,
        visibility: validated.data.visibility,
      },
      body.idempotencyKey,
    );
    return NextResponse.json({ app }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
