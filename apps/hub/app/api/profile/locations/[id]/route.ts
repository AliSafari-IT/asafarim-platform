import { NextResponse } from "next/server";
import { getSession, updateUserLocation, deleteUserLocation } from "@asafarim/auth";

export const runtime = "nodejs";

/** PATCH /api/profile/locations/[id] — update one of the signed-in user's own addresses. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const location = await updateUserLocation(session.user.id, id, body);
    if (!location) {
      return NextResponse.json({ error: "Address not found." }, { status: 404 });
    }
    return NextResponse.json({ location });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid address.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/profile/locations/[id] — remove one of the signed-in user's own addresses. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteUserLocation(session.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Address not found." }, { status: 404 });
  }

  return NextResponse.json({ message: "Address removed." });
}
