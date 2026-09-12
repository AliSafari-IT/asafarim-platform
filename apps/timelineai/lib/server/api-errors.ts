import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, NotFoundError } from "./authz";
import { VersionConflictError } from "./services/timelines";
import { RateLimitedError } from "./guest-rate-limit";
import { ExportTimeoutError } from "./services/export";
import { AiDisabledError, ProposalStateError } from "./services/ai-proposals";
import { AiQuotaExceededError, AiUnavailableError } from "./ai-quota";
import { AiProviderError } from "../ai/provider";
import { UnsupportedSourceError } from "../ai/source-import";

/**
 * Consistent typed error responses across every route. Non-technical
 * `message` is safe to show a general-audience user; `details` (validation
 * issues) are structured for the editor to highlight specific fields.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: "Some information couldn't be saved — check the highlighted fields.",
        details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
      { status: 400 }
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "forbidden", message: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
  }
  if (error instanceof VersionConflictError) {
    return NextResponse.json({ error: "version_conflict", message: error.message }, { status: 409 });
  }
  if (error instanceof RateLimitedError) {
    return NextResponse.json(
      { error: "rate_limited", message: error.message },
      { status: 429, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } }
    );
  }
  if (error instanceof ExportTimeoutError) {
    return NextResponse.json({ error: "export_timeout", message: error.message }, { status: 504 });
  }
  if (error instanceof AiDisabledError) {
    return NextResponse.json({ error: "ai_disabled", message: error.message }, { status: 503 });
  }
  if (error instanceof AiUnavailableError) {
    return NextResponse.json({ error: "ai_unavailable", message: error.message }, { status: 503 });
  }
  if (error instanceof AiQuotaExceededError) {
    return NextResponse.json(
      { error: "ai_quota_exceeded", message: error.message },
      { status: 429, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } }
    );
  }
  if (error instanceof ProposalStateError) {
    return NextResponse.json({ error: "proposal_state_conflict", message: error.message }, { status: 409 });
  }
  if (error instanceof UnsupportedSourceError) {
    return NextResponse.json({ error: "unsupported_source", message: error.message }, { status: 400 });
  }
  if (error instanceof AiProviderError) {
    return NextResponse.json(
      { error: "ai_provider_failed", message: "The AI provider couldn't generate a suggestion. Please try again." },
      { status: 502 }
    );
  }

  console.error("[timelineai] unhandled API error:", error);
  return NextResponse.json(
    { error: "internal_error", message: "Something went wrong on our end. Please try again." },
    { status: 500 }
  );
}
