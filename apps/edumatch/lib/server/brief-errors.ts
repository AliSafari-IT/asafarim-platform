import { NextResponse } from "next/server";
import { BriefError } from "./learning-briefs";
import { ProposalError } from "./lesson-proposals";
import { JourneyError } from "./learning-journey";
import { handleEduError, serverError } from "./index";

/**
 * One place that decides which HTTP status each domain error maps to, so the
 * learning-brief routes don't each re-derive it (and drift).
 *
 * NOT_FOUND is 404 rather than 403 on purpose: every service query scopes by
 * owner, so "someone else's brief" and "no such brief" are indistinguishable
 * from the outside — which is the point.
 */
export function handleBriefError(scope: string, error: unknown): NextResponse {
  if (error instanceof BriefError) {
    const status =
      error.code === "NOT_FOUND" ? 404 : error.code === "REFUSED" ? 422 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof ProposalError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "NOT_INVITED"
          ? 403
          : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof JourneyError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.code === "NOT_FOUND" ? 404 : 400 },
    );
  }
  if (error instanceof Error && error.name === "EduAuthError") {
    return handleEduError(scope, error);
  }
  return serverError(scope, error);
}
