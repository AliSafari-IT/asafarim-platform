import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getSession, updateUserProfile } from "@asafarim/auth";

export const runtime = "nodejs";

/** GET /api/profile — the full editable profile for the signed-in user. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true,
      bio: true,
      jobTitle: true,
      company: true,
      website: true,
      phone: true,
      preferredLocale: true,
      timezone: true,
      accounts: { select: { provider: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ user });
}

/** PATCH /api/profile — update core profile fields. */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await updateUserProfile(session.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: "Profile updated." });
}
