import { NextResponse } from "next/server";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

/** Maps a repository error to the right JSON status — never HTML for API routes. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  console.error("[appbuilder][api]", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
