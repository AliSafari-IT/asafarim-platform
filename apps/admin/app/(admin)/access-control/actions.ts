"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@asafarim/db";
import {
  MATRIX_ROLES,
  MODULE_VISIBILITY_KEY,
  NAV_MODULES,
  ROLES,
  getSession,
  hasRole,
  serializeModuleOverrides,
  type ModuleOverrides,
} from "@asafarim/auth";
import type { RoleName } from "@asafarim/auth";
import { writeAuditEvent } from "../../../lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Editing navigation visibility is superadmin-only.
 *
 * Not because it grants access — it does not — but because it changes what
 * every other admin can find, and an admin quietly hiding sections from
 * their peers is exactly the kind of change that should require the highest
 * role and leave an audit trail.
 */
async function requireSuperadmin(): Promise<
  { userId: string } | { error: string }
> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return { error: "Not signed in." };
  }
  if (!hasRole(session, [ROLES.SUPERADMIN])) {
    return { error: "Superadmin access required." };
  }
  return { userId: session.user.id };
}

/** Reject anything that is not a known module id mapped to known roles. */
function validateMatrix(input: unknown): ModuleOverrides | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: ModuleOverrides = {};
  for (const [moduleId, roles] of Object.entries(input as Record<string, unknown>)) {
    if (!NAV_MODULES.some((module) => module.id === moduleId)) return null;
    if (!Array.isArray(roles)) return null;
    for (const role of roles) {
      if (!MATRIX_ROLES.includes(role as RoleName)) return null;
    }
    out[moduleId] = roles as RoleName[];
  }
  return out;
}

export async function saveModuleVisibility(input: {
  matrix: Record<string, string[]>;
}): Promise<ActionResult> {
  const actor = await requireSuperadmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const validated = validateMatrix(input.matrix);
  if (validated === null) {
    return { ok: false, error: "The matrix contains an unknown module or role." };
  }

  // Only deviations from the registry defaults are persisted, so a later
  // change to a module's default takes effect for everyone who never
  // overrode it.
  const overrides = serializeModuleOverrides(validated);

  try {
    const existing = await prisma.platformSetting.findUnique({
      where: { key: MODULE_VISIBILITY_KEY },
      select: { value: true },
    });

    if (Object.keys(overrides).length === 0) {
      if (existing) {
        await prisma.platformSetting.delete({ where: { key: MODULE_VISIBILITY_KEY } });
      }
    } else {
      await prisma.platformSetting.upsert({
        where: { key: MODULE_VISIBILITY_KEY },
        update: {
          value: overrides as Prisma.InputJsonValue,
          updatedBy: actor.userId,
        },
        create: {
          key: MODULE_VISIBILITY_KEY,
          value: overrides as Prisma.InputJsonValue,
          updatedBy: actor.userId,
        },
      });
    }

    await writeAuditEvent({
      userId: actor.userId,
      action: "access.visibility.updated",
      entity: "PlatformSetting",
      entityId: MODULE_VISIBILITY_KEY,
      changes: { from: existing?.value ?? {}, to: overrides },
    });

    // Navigation is rendered by the console layout, so every route's menu
    // has to be rebuilt, not just this page.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("[admin] saveModuleVisibility failed:", error);
    return { ok: false, error: "The matrix could not be saved. Try again." };
  }
}
