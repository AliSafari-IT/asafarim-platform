import { getAuthedUser, unauthorized, forbidden, badRequest, serverError } from "./auth";
import { EduAuthError } from "./profiles";
import { NextResponse } from "next/server";

/**
 * Translate an `EduAuthError` thrown by requireRole/requireStudent/requireTutor
 * into the conventional JSON response. Anything else is a 500.
 */
export function handleEduError(scope: string, error: unknown): NextResponse {
  if (error instanceof EduAuthError) {
    return error.status === 401
      ? unauthorized()
      : forbidden(error.message);
  }
  return serverError(scope, error);
}

// Re-export so route handlers only need one import surface.
export { getAuthedUser, badRequest, serverError };
