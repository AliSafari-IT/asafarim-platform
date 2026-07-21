"use server";

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { archiveApp } from "@/lib/repositories/apps";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";

/**
 * Owner-authorized, explicit-confirmation archival. `archiveApp` is
 * idempotent (see lib/repositories/apps.ts) so a resubmitted confirmation —
 * double-click, refresh, network retry — never errors or double-writes;
 * it enforces "app.archive" (owner-only) and the same not-found-vs-forbidden
 * leak prevention as every other app-scoped mutation.
 */
export async function confirmArchiveAction(appId: string): Promise<void> {
  const actor = await requireActor({ callbackUrl: routes.appArchive(appId) });

  try {
    await archiveApp(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) {
      redirect(`${routes.appDetail(appId)}?actionError=forbidden`);
    }
    throw err;
  }

  redirect(routes.appDetail(appId));
}
