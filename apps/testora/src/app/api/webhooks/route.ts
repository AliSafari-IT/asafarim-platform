import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { outboundWebhooks } from "@/db/schema";

/**
 * Per-project outbound webhook endpoints (issue #261). The signing secret is
 * write-only — never returned once stored, matching the GitHub integration's
 * token handling (`githubConfigured` boolean instead of the value).
 */
function sanitize(row: typeof outboundWebhooks.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    url: row.url,
    enabled: row.enabled,
    secretConfigured: row.secret.length > 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  const rows = projectId
    ? await db.query.outboundWebhooks.findMany({ where: eq(outboundWebhooks.projectId, projectId) })
    : await db.query.outboundWebhooks.findMany();
  return NextResponse.json({ webhooks: rows.map(sanitize) });
}

const createSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().trim().url("Must be an absolute URL"),
  secret: z.string().min(16, "Secret must be at least 16 characters"),
  enabled: z.boolean().default(true),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [created] = await db
    .insert(outboundWebhooks)
    .values({ id: randomUUID(), ...parsed.data })
    .returning();
  return NextResponse.json({ webhook: sanitize(created!) }, { status: 201 });
}
