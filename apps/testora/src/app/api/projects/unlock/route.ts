import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import {
  verifyKey,
  unlockCookieValue,
  UNLOCK_COOKIE_NAME,
  UNLOCK_COOKIE_MAX_AGE,
  type ProjectRow,
} from "@/lib/app-access";

const schema = z.object({ id: z.string().min(1), key: z.string().min(1) });

// Verify a private app's key and, on success, grant a signed unlock cookie that
// keeps the app viewable in this browser for the cookie's lifetime (~7 days).
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide an app id and key" }, { status: 400 });
  }
  const { id, key } = parsed.data;

  const row = (await db.query.projects.findFirst({ where: eq(projects.id, id) })) as
    | ProjectRow
    | undefined;
  if (!row) return NextResponse.json({ error: "App not found" }, { status: 404 });

  // Public apps need no key; treat as already open.
  if (row.visibility === "public") return NextResponse.json({ ok: true });

  if (!verifyKey(key, row.keyHash)) {
    return NextResponse.json({ error: "Incorrect key" }, { status: 401 });
  }

  const store = await cookies();
  store.set(UNLOCK_COOKIE_NAME, await unlockCookieValue(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true });
}
