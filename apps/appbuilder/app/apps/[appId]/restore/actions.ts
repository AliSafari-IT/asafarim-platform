"use server";

import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { restoreApp } from "@/lib/repositories/apps";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";

/** Owner-authorized, idempotent restoration. See archive/actions.ts for the equivalent archive-side rationale. */
export async function confirmRestoreAction(appId: string): Promise<void> {
  const actor = await requireActor({ callbackUrl: routes.appRestore(appId) });

  try {
    await restoreApp(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) {
      redirect(`${routes.appDetail(appId)}?actionError=forbidden`);
    }
    throw err;
  }

  redirect(routes.appDetail(appId));
}
