"use server";

import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requestPreviewBuild } from "@/lib/repositories/previewService";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";

/**
 * Triggers (or reuses) a preview build for the app's current specification
 * version, then returns to the overview page — which re-reads the pinned
 * preview pointer and latest-attempt status fresh, so this action itself
 * never needs to pass a result back beyond a redirect.
 */
export async function requestPreviewBuildAction(appId: string): Promise<void> {
  const actor = await requireActor({ callbackUrl: routes.appDetail(appId) });

  try {
    await requestPreviewBuild(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) {
      redirect(`${routes.appDetail(appId)}?actionError=forbidden`);
    }
    if (err instanceof ConflictError) {
      redirect(`${routes.appDetail(appId)}?actionError=archived`);
    }
    throw err;
  }

  redirect(routes.appDetail(appId));
}
