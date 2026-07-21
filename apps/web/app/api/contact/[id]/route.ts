import { NextResponse } from "next/server";
import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { deleteObject } from "@asafarim/storage";

export const runtime = "nodejs";

const ALLOWED_STATUS = ["sent", "read", "archived"];

/** Update the status of one of the caller's own messages (e.g. archive it). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status;
  if (!status || !ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const message = await prisma.contactMessage.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!message) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (message.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.contactMessage.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}

/** Delete one of the caller's own contact messages and its stored attachments. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const message = await prisma.contactMessage.findUnique({
    where: { id },
    include: { attachments: { select: { storageKey: true } } },
  });
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (message.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Best-effort storage cleanup, then remove the row (attachments cascade).
  await Promise.all(message.attachments.map((a) => deleteObject(a.storageKey)));
  await prisma.contactMessage.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
