import "server-only";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, fromPrismaError } from "../errors";
import { logger } from "../observability/logger";

export const API_VERSION = "v1";

export function correlationId(req: Request): string {
  return req.headers.get("x-correlation-id")?.slice(0, 100) || randomUUID();
}

export function ok(data: unknown, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json({ data }, { status: init?.status ?? 200, headers: init?.headers });
}

export function page<T>(items: T[], nextCursor: string | null) {
  return NextResponse.json({ data: items, page: { nextCursor } });
}

export function fail(err: unknown, cid: string) {
  const apiErr =
    err instanceof ApiError
      ? err
      : fromPrismaError(err) ??
        (err instanceof z.ZodError
          ? new ApiError("validation_failed", err.flatten())
          : new ApiError("internal"));

  if (apiErr.status >= 500) {
    logger.error({ cid, err: err instanceof Error ? err.message : String(err) }, "api.error");
  }
  return NextResponse.json(apiErr.toBody(), {
    status: apiErr.status,
    headers: { "x-correlation-id": cid },
  });
}

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function parsePagination(url: URL) {
  return paginationSchema.parse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
}

/**
 * Optimistic concurrency: a mutation that targets a versioned resource must
 * send `If-Match: "<version>"`. Missing header is allowed (last-write-wins
 * opt-out) but a present, stale value is a 409.
 */
export function assertVersion(req: Request, currentVersion: number) {
  const raw = req.headers.get("if-match");
  if (raw == null) return;
  const expected = Number(raw.replace(/"/g, "").trim());
  if (Number.isNaN(expected)) throw new ApiError("validation_failed", { header: "If-Match" });
  if (expected !== currentVersion) {
    throw new ApiError("conflict_version", { expected, current: currentVersion });
  }
}

export function hashRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method} ${path} ${JSON.stringify(body ?? null)}`)
    .digest("hex");
}
