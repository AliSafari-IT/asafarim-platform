import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { targetChanges, targetEnvironments, targetSecrets } from "@/db/schema";
import { auth } from "@asafarim/auth";
import { originChanges, secretsMoveDecision } from "@/lib/target-origin-change";
import { DEFAULT_PROJECT_ID } from "@/data/projects";
import { checkStoredUrls } from "@/lib/run-target";

// Target environments (Local / Remote / user-added) a run can be pointed at.
// Built-in entries are seeded per app by seedDatabase(); this route also lets the
// Run page add and remove user-defined targets, which persist in the DB.

// List a project's targets, built-ins first then user-added, each group ordered.
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") || DEFAULT_PROJECT_ID;
  const rows = await db
    .select()
    .from(targetEnvironments)
    .where(eq(targetEnvironments.projectId, projectId))
    .orderBy(asc(targetEnvironments.sortOrder), asc(targetEnvironments.name));
  // Seeded entries first (sortOrder is only meaningful within the seeded group).
  const sorted = rows.slice().sort((a, b) => {
    if (a.seeded !== b.seeded) return a.seeded ? -1 : 1;
    if (a.seeded) return a.sortOrder - b.sortOrder;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  // Whether each target passes the network policy here (e.g. the seeded Local
  // target is refused in production), so the Run page can default to one that
  // runs and label the rest.
  const verdicts = await Promise.all(
    sorted.map((t) => checkStoredUrls([t.baseUrl, t.apiUrl, t.hubUrl])),
  );
  return NextResponse.json(
    sorted.map((t, i) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      baseUrl: t.baseUrl,
      apiUrl: t.apiUrl,
      hubUrl: t.hubUrl,
      seeded: t.seeded,
      runnable: verdicts[i] === null,
      unrunnableReason: verdicts[i]?.body.error ?? null,
    })),
  );
}

const urlField = z.string().trim().url("Must be an absolute URL (http:// or https://)");
// Optional Hub (SSO gateway) URL; "" clears it.
const hubField = urlField.or(z.literal("")).transform((v) => v || null);

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  baseUrl: urlField,
  apiUrl: urlField,
  hubUrl: hubField.optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId, name, baseUrl, apiUrl, hubUrl } = parsed.data;
  // Saved targets are what testers run against — hold them to the network policy.
  const blocked = await checkStoredUrls([baseUrl, apiUrl, hubUrl]);
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}`;
  try {
    const [target] = await db
      .insert(targetEnvironments)
      .values({ id, projectId, name, baseUrl, apiUrl, hubUrl: hubUrl ?? null, seeded: false, sortOrder: 0 })
      .returning();
    return NextResponse.json({ target }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create target" }, { status: 500 });
  }
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").optional(),
    baseUrl: urlField.optional(),
    apiUrl: urlField.optional(),
    hubUrl: hubField.optional(),
    // #713: required to move a target with stored secrets to another origin.
    confirmSecretsMove: z.boolean().optional(),
    secretsAction: z.enum(["keep", "clear"]).optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.baseUrl !== undefined || v.apiUrl !== undefined || v.hubUrl !== undefined,
    { message: "Nothing to update" },
  );

// Edit a user-added target. Built-in (seeded) targets can't be edited — they are
// reconciled from code on each re-seed, so any DB edit would be overwritten.
export async function PATCH(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { confirmSecretsMove, secretsAction, ...fields } = parsed.data;
  const blocked = await checkStoredUrls([fields.baseUrl, fields.apiUrl, fields.hubUrl]);
  if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });

  const notFound = () =>
    NextResponse.json({ error: "Target not found or is a built-in that can't be edited" }, { status: 404 });
  const session = await auth();

  // Read, decide and write in ONE transaction with the target row locked, so a
  // secret added (or the target changed) concurrently can't slip past the
  // decision (#713 review).
  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(targetEnvironments)
      .where(and(eq(targetEnvironments.id, id), eq(targetEnvironments.seeded, false)))
      .for("update");
    if (!existing) return { kind: "not-found" as const };

    // #713: secrets saved for one origin must not silently follow the target
    // to another — ask first (409), then keep or clear them as the admin chose.
    const changes = originChanges(existing, fields);
    const secretNames = changes.length
      ? (await tx.select({ name: targetSecrets.name }).from(targetSecrets).where(eq(targetSecrets.targetId, id))).map(
          (row) => row.name,
        )
      : [];
    const decision = secretsMoveDecision({ changes, secretNames, confirmSecretsMove, secretsAction });
    if (!decision.ok) return { kind: "refused" as const, decision };

    const [row] = await tx
      .update(targetEnvironments)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(targetEnvironments.id, id), eq(targetEnvironments.seeded, false)))
      .returning();
    if (!row) return { kind: "not-found" as const };
    if (decision.clearSecrets) await tx.delete(targetSecrets).where(eq(targetSecrets.targetId, id));
    if (changes.length > 0) {
      await tx.insert(targetChanges).values(
        changes.map((change) => ({
          id: crypto.randomUUID(),
          targetId: id,
          projectId: existing.projectId,
          field: change.field,
          fromOrigin: change.from,
          toOrigin: change.to,
          secretsAction: secretNames.length === 0 ? "none" : decision.clearSecrets ? "clear" : "keep",
          userId: session?.user?.id ?? null,
          userName: session?.user?.name ?? session?.user?.email ?? null,
        })),
      );
    }
    return { kind: "updated" as const, row, cleared: decision.clearSecrets ? secretNames : [] };
  });

  if (outcome.kind === "not-found") return notFound();
  if (outcome.kind === "refused") {
    return NextResponse.json(outcome.decision.body, { status: outcome.decision.status });
  }
  return NextResponse.json({ target: outcome.row, secretsCleared: outcome.cleared });
}

// Remove a user-added target. Built-in (seeded) targets can't be deleted — they
// are managed by the seed and would just reappear on the next re-seed.
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }
  const deleted = await db
    .delete(targetEnvironments)
    .where(and(eq(targetEnvironments.id, id), eq(targetEnvironments.seeded, false)))
    .returning({ id: targetEnvironments.id });
  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Target not found or is a built-in that can't be removed" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
