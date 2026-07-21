"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { createApp } from "@/lib/repositories/apps";
import { ConflictError } from "@/lib/errors";
import { slugify, validateCreateAppInput } from "@/lib/validation/createApp";
import { routes } from "@/lib/routes";

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
