import "server-only";
import { NextResponse } from "next/server";
import { resolveContext, type RequestContext } from "../context";
import { checkIdempotency } from "./idempotency";
import { correlationId, fail } from "./http";

/** Wrap a handler that does not need a workspace context. */
export function route(fn: (req: Request, cid: string) => Promise<Response>) {
  return async (req: Request) => {
    const cid = correlationId(req);
    try {
      return await fn(req, cid);
    } catch (err) {
      return fail(err, cid);
    }
  };
}

type Params = Record<string, string>;

/** Wrap a handler that needs `ctx` resolved from the `[slug]` route param. */
export function workspaceRoute(
  fn: (args: {
    req: Request;
    ctx: RequestContext;
    params: Params;
    cid: string;
  }) => Promise<Response>,
) {
  return async (req: Request, context: { params: Promise<Params> }) => {
    const cid = correlationId(req);
    try {
      const params = await context.params;
      const ctx = await resolveContext(params.slug, cid);
      return await fn({ req, ctx, params, cid });
    } catch (err) {
      return fail(err, cid);
    }
  };
}

/**
 * Run a POST mutation with Idempotency-Key support: replays a stored
 * response for a repeated key, or persists the fresh one.
 */
export async function withIdempotency(
  ctx: RequestContext,
  req: Request,
  body: unknown,
  produce: () => Promise<{ status: number; data: unknown }>,
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  const url = new URL(req.url);
  const { replay, commit } = await checkIdempotency(ctx, key, "POST", url.pathname, body);
  if (replay) {
    return NextResponse.json(replay.responseBody as object, { status: replay.responseCode });
  }
  const { status, data } = await produce();
  const responseBody = { data };
  if (commit) await commit(status, responseBody);
  return NextResponse.json(responseBody, { status });
}
