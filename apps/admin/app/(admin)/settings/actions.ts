"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@asafarim/db";
import { ROLES, getSession, hasRole, hasPermission } from "@asafarim/auth";
import type { Session } from "next-auth";
import { writeAuditEvent } from "../../../lib/audit";
import { getSettingDefinition, type SettingValue } from "../../../lib/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireActor(
  permission: string
): Promise<{ session: Session } | { error: string }> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return { error: "Not signed in." };
  }
  if (!hasRole(session, [ROLES.ADMIN])) {
    return { error: "Admin access required." };
  }
  if (!(await hasPermission(session, permission))) {
    return { error: `Missing permission: ${permission}.` };
  }
  return { session };
}

function validateValue(
  key: string,
  value: SettingValue
): { ok: true; value: SettingValue } | { ok: false; error: string } {
  const definition = getSettingDefinition(key);
  if (!definition) {
    // Only cataloged keys may exist — this is the boundary that keeps the
    // table from becoming a free-form store.
    return { ok: false, error: "Unknown setting key." };
  }
  if (definition.type === "boolean") {
    if (typeof value !== "boolean") {
      return { ok: false, error: `${definition.label} must be on or off.` };
    }
    return { ok: true, value };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${definition.label} must be text.` };
  }
  const trimmed = value.trim();
  if (definition.maxLength && trimmed.length > definition.maxLength) {
    return {
      ok: false,
      error: `${definition.label} must be ${definition.maxLength} characters or fewer.`,
    };
  }
  return { ok: true, value: trimmed };
}

export async function updatePlatformSetting(input: {
  key: string;
  value: SettingValue;
}): Promise<ActionResult> {
  const actor = await requireActor("settings.edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  const validated = validateValue(input.key, input.value);
  if (!validated.ok) return validated;
  const definition = getSettingDefinition(input.key)!;

  try {
    const existing = await prisma.platformSetting.findUnique({
      where: { key: input.key },
    });
    const before = existing?.value ?? definition.defaultValue;
    if (before === validated.value) return { ok: true };

    await prisma.platformSetting.upsert({
      where: { key: input.key },
      update: { value: validated.value, updatedBy: actor.session.user.id },
      create: {
        key: input.key,
        value: validated.value,
        updatedBy: actor.session.user.id,
      },
    });

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "settings.updated",
      entity: "PlatformSetting",
      entityId: input.key,
      changes: { from: before, to: validated.value },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[admin] updatePlatformSetting failed:", error);
    return { ok: false, error: "The setting could not be saved. Try again." };
  }
}

export async function resetPlatformSetting(input: {
  key: string;
}): Promise<ActionResult> {
  const actor = await requireActor("settings.edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  const definition = getSettingDefinition(input.key);
  if (!definition) return { ok: false, error: "Unknown setting key." };

  try {
    const existing = await prisma.platformSetting.findUnique({
      where: { key: input.key },
    });
    if (!existing) return { ok: true };

    await prisma.platformSetting.delete({ where: { key: input.key } });

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "settings.reset",
      entity: "PlatformSetting",
      entityId: input.key,
      changes: { from: existing.value, to: definition.defaultValue },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[admin] resetPlatformSetting failed:", error);
    return { ok: false, error: "The setting could not be reset. Try again." };
  }
}
