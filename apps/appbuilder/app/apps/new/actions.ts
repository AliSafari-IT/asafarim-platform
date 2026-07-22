"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { creationRequests } from "@/lib/db/schema";
import { createApp } from "@/lib/repositories/apps";
import { enqueueGenerationJob } from "@/lib/repositories/generationJobs";
import { ConflictError } from "@/lib/errors";
import { slugify, validateCreateAppInput } from "@/lib/validation/createApp";
import { routes } from "@/lib/routes";
import { nudgeWorker } from "@/lib/server/queue";

/**
 * Server Action backing the prompt-first `/apps/new` form. Progressive
 * enhancement: a plain HTML form POST works without client JS. Validation
 * failures redirect back to `/apps/new` with field errors and the
 * non-sensitive input echoed via query params (see page.tsx), so the user
 * never loses what they typed.
 *
 * The actor is always resolved server-side from the session — nothing in
 * the submitted form (hidden or otherwise) can substitute for it, and the
 * idempotency key is generated once when the form was rendered (a hidden
 * field), not per-submission, so a double-click or network retry reuses it
 * instead of minting a fresh one that would defeat idempotency.
 */
export async function createAppAction(formData: FormData): Promise<void> {
  const actor = await requireActor({ callbackUrl: "/apps/new" });

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const raw = {
    name: String(formData.get("name") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    starterFamily: String(formData.get("starterFamily") ?? ""),
    visibility: String(formData.get("visibility") ?? ""),
  };

  const validated = validateCreateAppInput(raw);
  if (!validated.ok || idempotencyKey.length < 8) {
    const params = new URLSearchParams();
    params.set("error", "1");
    const values = validated.ok
      ? { name: raw.name, prompt: raw.prompt, starterFamily: raw.starterFamily, visibility: raw.visibility }
      : validated.values;
    params.set("name", values.name);
    params.set("prompt", values.prompt);
    params.set("starterFamily", values.starterFamily);
    params.set("visibility", values.visibility);
    if (!validated.ok) {
      params.set("fieldErrors", JSON.stringify(validated.fieldErrors));
    }
    redirect(`/apps/new?${params.toString()}`);
  }

  try {
    const app = await createApp(
      getDb(),
      actor,
      {
        name: validated.data.name,
        slug: slugify(validated.data.name),
        description: validated.data.prompt.slice(0, 2000),
        prompt: validated.data.prompt,
        starterFamily: validated.data.starterFamily,
        visibility: validated.data.visibility,
      },
      idempotencyKey,
    );

    // Best-effort: app creation has already succeeded and committed above —
    // a failure here (e.g. the per-app active-job limit, though it can't
    // realistically be hit for a brand-new app) must never roll that back
    // or block the redirect. The detail page offers its own "Start
    // generation"/"Retry" action if this enqueue didn't happen.
    try {
      const db = getDb();
      const [creationRequest] = await db
        .select()
        .from(creationRequests)
        .where(eq(creationRequests.appId, app.id))
        .limit(1);
      if (creationRequest) {
        const job = await enqueueGenerationJob(db, actor, app.id, {
          creationRequestId: creationRequest.id,
          requestedTemplateId: creationRequest.starterFamily,
          // Derived from the same per-render idempotency key as app
          // creation, so a double-submit of this exact form also dedupes
          // the generation job it triggers, not just the app row.
          idempotencyKey: `${idempotencyKey}:generate`,
        });
        await nudgeWorker(job.id, { cause: "enqueue" });
      }
    } catch (enqueueErr) {
      console.error("[appbuilder] failed to auto-enqueue generation job after app creation", enqueueErr);
    }

    redirect(routes.appDetail(app.id));
  } catch (err) {
    if (err instanceof ConflictError) {
      const params = new URLSearchParams();
      params.set("error", "1");
      params.set("name", validated.data.name);
      params.set("prompt", validated.data.prompt);
      params.set("starterFamily", validated.data.starterFamily);
      params.set("visibility", validated.data.visibility);
      params.set(
        "fieldErrors",
        JSON.stringify({ form: [err.message] }),
      );
      redirect(`/apps/new?${params.toString()}`);
    }
    throw err;
  }
}
