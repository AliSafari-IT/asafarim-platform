import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  lockCookieValue,
  UNLOCK_COOKIE_NAME,
  UNLOCK_COOKIE_MAX_AGE,
} from "@/lib/app-access";

const schema = z.object({ id: z.string().min(1) });

// Re-lock a private app for this browser by dropping it from the unlock cookie.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide an app id" }, { status: 400 });
  }
  const store = await cookies();
  store.set(UNLOCK_COOKIE_NAME, await lockCookieValue(parsed.data.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true });
}
