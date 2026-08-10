"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@asafarim/db";
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

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Validate and normalize an incoming value against its definition.
 *
 * The client sends whatever it likes; this is the only gate that matters,
 * and it derives every rule from the catalog so a new setting type cannot
 * ship with a validation hole.
 */
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
  const { label } = definition;

  switch (definition.type) {
    case "boolean": {
      if (typeof value !== "boolean") {
        return { ok: false, error: `${label} must be on or off.` };
      }
      return { ok: true, value };
    }

    case "number": {
      const numeric = typeof value === "number" ? value : Number(value);
      if (typeof value === "boolean" || Array.isArray(value) || !Number.isFinite(numeric)) {
        return { ok: false, error: `${label} must be a number.` };
      }
      if (!Number.isInteger(numeric)) {
        return { ok: false, error: `${label} must be a whole number.` };
      }
      if (definition.min !== undefined && numeric < definition.min) {
        return { ok: false, error: `${label} must be at least ${definition.min}.` };
      }
      if (definition.max !== undefined && numeric > definition.max) {
        return { ok: false, error: `${label} must be at most ${definition.max}.` };
      }
      return { ok: true, value: numeric };
    }

    case "select": {
      if (typeof value !== "string" || !(definition.options ?? []).includes(value)) {
        return {
          ok: false,
          error: `${label} must be one of: ${(definition.options ?? []).join(", ")}.`,
        };
      }
      return { ok: true, value };
    }

    case "string[]": {
      // The editor submits one entry per line; accept either shape so the
      // action is usable from a plain form as well.
      const items = (Array.isArray(value) ? value : String(value).split("\n"))
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
      if (definition.maxItems && items.length > definition.maxItems) {
        return {
          ok: false,
          error: `${label} accepts at most ${definition.maxItems} entries.`,
        };
      }
      if (definition.maxLength && items.some((item) => item.length > definition.maxLength!)) {
        return {
          ok: false,
          error: `Each ${label} entry must be ${definition.maxLength} characters or fewer.`,
        };
      }
      if (new Set(items).size !== items.length) {
        return { ok: false, error: `${label} contains duplicate entries.` };
      }
      return { ok: true, value: items };
    }

    case "color": {
      if (typeof value !== "string" || !HEX_COLOR.test(value.trim())) {
        return { ok: false, error: `${label} must be a hex colour like #e0a458.` };
      }
      return { ok: true, value: value.trim().toLowerCase() };
    }

    default: {
      if (typeof value !== "string") {
        return { ok: false, error: `${label} must be text.` };
      }
      const trimmed = value.trim();
      if (definition.maxLength && trimmed.length > definition.maxLength) {
        return {
          ok: false,
          error: `${label} must be ${definition.maxLength} characters or fewer.`,
        };
      }
      return { ok: true, value: trimmed };
    }
  }
}

/** Structural equality for setting values, including the array type. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
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
    if (sameValue(before, validated.value)) return { ok: true };

    await prisma.platformSetting.upsert({
      where: { key: input.key },
      update: {
        value: validated.value as Prisma.InputJsonValue,
        updatedBy: actor.session.user.id,
      },
      create: {
        key: input.key,
        value: validated.value as Prisma.InputJsonValue,
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
