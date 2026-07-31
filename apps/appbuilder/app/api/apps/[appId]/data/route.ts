import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { eraseAppData, exportAppData } from "@/lib/retention/appData";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { correlationIdFrom, withCorrelationId } from "@/lib/observability/correlation";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * M13 slice G — owner data export. Returns everything this app retains about
 * its conversation as one JSON document (see lib/retention/appData.ts for
 * what is and is not included, and why).
 *
 * Owner-only via `app.exportData`. Served as an attachment rather than an
 * inline body: this response contains the full text of every message,
 * extracted file, and imported page, and a browser rendering that inline is
 * an easy way for it to end up somewhere it should not be.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const correlationId = correlationIdFrom(request);
  try {
    const data = await exportAppData(getDb(), actor, appId);
    const response = NextResponse.json(data);
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="appbuilder-${appId}-export.json"`
    );
    // Never cached anywhere: this is the single most sensitive response the
    // API produces.
    response.headers.set("Cache-Control", "no-store, private");
    return withCorrelationId(response, correlationId);
  } catch (err) {
    return withCorrelationId(errorResponse(err), correlationId);
  }
}

/**
 * M13 slice G — owner-initiated erasure of retained conversation content.
 *
 * Irreversible, so it requires an explicit typed confirmation in the body
 * rather than being a bare DELETE: `{ "confirm": "<appId>" }`. That mirrors
 * the M08 destructive-confirmation principle (a destructive action must be
 * bound to the exact thing being destroyed) and makes an accidental or
 * CSRF-shaped call insufficient on its own — the caller has to know and
 * restate which app they mean.
 *
 * The app, its specification, its version history, and its audit trail all
 * survive. This erases conversation content only; see
 * lib/retention/appData.ts#eraseAppData.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const correlationId = correlationIdFrom(request);
  const raw = await request.json().catch(() => null);
  const confirm = (raw as { confirm?: unknown } | null)?.confirm;

  if (confirm !== appId) {
    return withCorrelationId(
      NextResponse.json(
        {
          error:
            "Erasing this app's conversation data is irreversible. Send { \"confirm\": \"<appId>\" } to proceed.",
          code: "erasure_confirmation_required",
        },
        { status: 400 }
      ),
      correlationId
    );
  }

  try {
    const result = await eraseAppData(getDb(), actor, appId);
    return withCorrelationId(NextResponse.json(result), correlationId);
  } catch (err) {
    return withCorrelationId(errorResponse(err), correlationId);
  }
}
