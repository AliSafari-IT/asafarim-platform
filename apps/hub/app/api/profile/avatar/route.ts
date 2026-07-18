import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getSession } from "@asafarim/auth";
import { saveAvatar, validateAvatar, removeAvatar } from "../../../../lib/server/avatar";

export const runtime = "nodejs";

/** POST /api/profile/avatar — upload a new avatar image for the signed-in user. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing avatar file." }, { status: 400 });
  }

  const validation = validateAvatar(file);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const saved = await saveAvatar(session.user.id, file);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: saved.url },
  });

  return NextResponse.json({ image: saved.url });
}

/** DELETE /api/profile/avatar — remove the user's avatar. */
export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: null },
  });

  if (user?.image) {
    await removeAvatar(user.image);
  }

  return NextResponse.json({ image: null });
}
