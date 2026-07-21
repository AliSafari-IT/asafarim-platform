import { NextResponse } from "next/server";
import { auth, isAdmin } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { getObjectBytes } from "@asafarim/storage";

export const runtime = "nodejs";

/** Stream a contact attachment to its owner (or an admin). Files are private. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await prisma.contactAttachment.findUnique({
    where: { id },
    include: { message: { select: { userId: true } } },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const owns = attachment.message.userId === session.user.id;
  if (!owns && !isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const object = await getObjectBytes(attachment.storageKey);
  if (!object) {
    return NextResponse.json({ error: "File missing from storage." }, { status: 404 });
  }

  // Cast to satisfy the BodyInit typing for a Node Buffer.
  return new NextResponse(object.body as unknown as BodyInit, {
    headers: {
      "Content-Type": attachment.contentType || object.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      "Content-Length": String(attachment.sizeBytes),
      "Cache-Control": "private, no-store",
    },
  });
}
