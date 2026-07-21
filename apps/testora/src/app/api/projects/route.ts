import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, functionalRequirements } from "@/db/schema";
import {
  hashKey,
  getUnlockedProjectIds,
  unlockCookieValue,
  listProjectsForViewer,
  UNLOCK_COOKIE_NAME,
  UNLOCK_COOKIE_MAX_AGE,
  type ProjectRow,
} from "@/lib/app-access";
import { encryptToken } from "@/lib/github";

const visibility = z.enum(["public", "private"]);
const optionalUrl = z.string().trim().url("Must be an absolute URL").or(z.literal(""));

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}

function sanitize(row: ProjectRow) {
  // Never leak the key hash or the encrypted GitHub token to the client — only
  // the repo string and a boolean for whether a token is configured.
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiUrl: row.apiUrl,
    visibility: row.visibility,
    productName: row.productName,
    companyName: row.companyName,
    githubRepo: row.githubRepo,
    githubConfigured: Boolean(row.githubTokenEnc),
    seeded: row.seeded,
  };
}

async function setUnlockCookie(id: string) {
  const store = await cookies();
  store.set(UNLOCK_COOKIE_NAME, await unlockCookieValue(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

// List all apps as client-safe views (locked apps expose only id/name/visibility).
export async function GET() {
  return NextResponse.json(await listProjectsForViewer());
}

const createSchema = z
  .object({
    id: z.string().trim().optional(),
    name: z.string().trim().min(1, "Name is required"),
    baseUrl: optionalUrl.default(""),
    apiUrl: optionalUrl.default(""),
    visibility: visibility.default("public"),
    key: z.string().min(4, "Key must be at least 4 characters").optional(),
    productName: z.string().trim().optional(),
    companyName: z.string().trim().optional(),
    githubRepo: z.string().trim().optional(),
    githubToken: z.string().trim().optional(),
  })
  .refine((v) => v.visibility !== "private" || Boolean(v.key), {
    message: "A private app needs a key",
    path: ["key"],
  });

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const id = slugify(data.id || data.name);
  const isPrivate = data.visibility === "private";
  try {
    const [created] = await db
      .insert(projects)
      .values({
        id,
        name: data.name,
        baseUrl: data.baseUrl,
        apiUrl: data.apiUrl,
        visibility: data.visibility,
        keyHash: isPrivate && data.key ? hashKey(data.key) : null,
        productName: data.productName || null,
        companyName: data.companyName || null,
        githubRepo: data.githubRepo || null,
        githubTokenEnc: data.githubToken ? encryptToken(data.githubToken) : null,
        seeded: false,
      })
      .returning();
    // Creating a private app proves knowledge of its key — unlock it for the
    // creator so they aren't immediately locked out of what they just made.
    if (isPrivate) await setUnlockCookie(id);
    return NextResponse.json({ project: sanitize(created as ProjectRow) }, { status: 201 });
  } catch (error) {
    const conflict =
      error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505";
    return NextResponse.json(
      { error: conflict ? `An app with id "${id}" already exists.` : "Failed to create app" },
      { status: conflict ? 409 : 500 },
    );
  }
}

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  baseUrl: optionalUrl.optional(),
  apiUrl: optionalUrl.optional(),
  visibility: visibility.optional(),
  key: z.string().min(4, "Key must be at least 4 characters").optional(),
  productName: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  githubRepo: z.string().trim().optional(),
  // Omit to keep the current token; "" to clear it; any value to replace it.
  githubToken: z.string().trim().optional(),
});

export async function PATCH(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing app id" }, { status: 400 });

  const row = (await db.query.projects.findFirst({ where: eq(projects.id, id) })) as
    | ProjectRow
    | undefined;
  if (!row) return NextResponse.json({ error: "App not found" }, { status: 404 });

  // Can't edit a private app you haven't unlocked.
  if (row.visibility === "private" && !(await getUnlockedProjectIds()).includes(id)) {
    return NextResponse.json({ error: "App is locked — unlock it first" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const nextVisibility = data.visibility ?? row.visibility;

  let keyHash = row.keyHash;
  if (nextVisibility === "public") {
    keyHash = null;
  } else if (data.key) {
    keyHash = hashKey(data.key);
  } else if (!row.keyHash) {
    return NextResponse.json(
      { error: "Set a key to make this app private", details: { key: ["A private app needs a key"] } },
      { status: 400 },
    );
  }

  // GitHub token: omitted → keep; "" → clear; any value → (re)encrypt.
  const githubTokenEnc =
    data.githubToken === undefined
      ? row.githubTokenEnc
      : data.githubToken
        ? encryptToken(data.githubToken)
        : null;

  const [updated] = await db
    .update(projects)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.baseUrl !== undefined ? { baseUrl: data.baseUrl } : {}),
      ...(data.apiUrl !== undefined ? { apiUrl: data.apiUrl } : {}),
      ...(data.productName !== undefined ? { productName: data.productName || null } : {}),
      ...(data.companyName !== undefined ? { companyName: data.companyName || null } : {}),
      ...(data.githubRepo !== undefined ? { githubRepo: data.githubRepo || null } : {}),
      githubTokenEnc,
      visibility: nextVisibility,
      keyHash,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  // Keep the editor unlocked when the app is (still) private.
  if (nextVisibility === "private") await setUnlockCookie(id);

  return NextResponse.json({ project: sanitize(updated as ProjectRow) });
}

// Delete a user-created app and its catalog. Built-in (seeded) apps can't be
// deleted — they'd just reappear on the next re-seed.
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing app id" }, { status: 400 });

  const row = (await db.query.projects.findFirst({ where: eq(projects.id, id) })) as
    | ProjectRow
    | undefined;
  if (!row) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (row.seeded) {
    return NextResponse.json({ error: "Built-in apps can't be deleted" }, { status: 403 });
  }
  if (row.visibility === "private" && !(await getUnlockedProjectIds()).includes(id)) {
    return NextResponse.json({ error: "App is locked — unlock it first" }, { status: 403 });
  }

  // Remove the app's catalog first (FKs cascade suites→fixtures→cases→results).
  await db.delete(functionalRequirements).where(eq(functionalRequirements.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
