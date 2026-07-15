import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { getLocalObject, isKeyOwnedBy, putLocalObject } from "@/lib/server/storage";

export const runtime = "nodejs";

function readKey(req: Request): string | null {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  return key && key.length <= 512 ? key : null;
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const key = readKey(req);
    if (!key) return badRequest("Missing upload key.");
    if (!isKeyOwnedBy(key, user.id)) {
      return badRequest("Upload key does not belong to the authenticated user.");
    }

    const contentType = req.headers.get("content-type") ?? "application/octet-stream";
    const body = Buffer.from(await req.arrayBuffer());
    await putLocalObject(key, body, contentType);

    return NextResponse.json({ ok: true, key, sizeBytes: body.length });
  } catch (error) {
    return serverError("uploads/local PUT", error);
  }
}

export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const key = readKey(req);
    if (!key) return badRequest("Missing upload key.");
    if (!isKeyOwnedBy(key, user.id)) {
      return badRequest("Upload key does not belong to the authenticated user.");
    }

    const object = await getLocalObject(key);
    if (!object) {
      return NextResponse.json({ error: "Local object not found." }, { status: 404 });
    }

    return new Response(new Uint8Array(object.body), {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return serverError("uploads/local GET", error);
  }
}
