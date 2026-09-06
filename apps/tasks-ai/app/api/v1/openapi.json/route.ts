import { NextResponse } from "next/server";
import { openapiDocument } from "../../../../lib/api/openapi";

// The API contract. Public: it describes the shape, not any data.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(openapiDocument);
}
