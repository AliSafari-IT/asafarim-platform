import { NextResponse } from "next/server";
import { getSession, listUserLocations, createUserLocation } from "@asafarim/auth";

export const runtime = "nodejs";

/** GET /api/profile/locations — every address for the signed-in user. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const locations = await listUserLocations(session.user.id);
  return NextResponse.json({ locations });
}

/** POST /api/profile/locations — add a new address. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const location = await createUserLocation(session.user.id, body);
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid address.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
