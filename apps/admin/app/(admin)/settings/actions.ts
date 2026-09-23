"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  Prisma,
  encryptSecret,
  getSettingDefinition,
  isSensitiveSetting,
  type SettingDefinition,
  type SettingValue,
} from "@asafarim/db";
import { ROLES, getSession, hasRole, hasPermission } from "@asafarim/auth";
import type { Session } from "next-auth";
import { writeAuditEvent } from "../../../lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The permission a setting requires, based on its own sensitivity rather
 * than a caller-supplied string — the point of this split is that "can
 * toggle the maintenance banner" and "can rotate a live payment key" are
 * never allowed to collapse into the same check by a call-site mistake.
 */
function requiredPermission(definition: SettingDefinition, action: "view" | "edit"): string {
  return isSensitiveSetting(definition) ? `settings.secrets.${action}` : `settings.${action}`;
}

async function requireActor(
  definition: SettingDefinition,
  action: "view" | "edit"
): Promise<{ session: Session } | { error: string }> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return { error: "Not signed in." };
  }
  if (!hasRole(session, [ROLES.ADMIN])) {
    return { error: "Admin access required." };
  }
  const permission = requiredPermission(definition, action);
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

    case "json": {
      // The client sends the already-parsed value (Server Actions
      // deserialize arguments as JSON), so this is a structural check, not
      // a parse — a malformed textarea draft never gets this far because
      // the editor blocks Save until JSON.parse succeeds client-side.
      if (typeof value !== "object" || value === null) {
        return { ok: false, error: `${label} must be a JSON object or array.` };
      }
      return { ok: true, value: value as SettingValue };
    }

    case "secret": {
      if (typeof value !== "string") {
        return { ok: false, error: `${label} must be text.` };
      }
      // An empty submit is never a valid "set this secret" request — the
      // client never receives the real value to diff against, so an empty
      // draft is treated as "the field was left untouched," and clearing a
      // live secret requires the explicit reset action instead.
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return {
          ok: false,
          error: `Enter a value to update ${label}, or use "reset to default" to clear it.`,
        };
      }
      if (definition.maxLength && trimmed.length > definition.maxLength) {
        return {
          ok: false,
          error: `${label} must be ${definition.maxLength} characters or fewer.`,
        };
      }
      return { ok: true, value: trimmed };
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

/**
 * Structural equality for setting values, including arrays and `json`
 * objects. A fresh object/array is never `===` its stored counterpart, so
 * this falls back to a JSON.stringify comparison for both — settings-sized
 * payloads, not a place that needs a real deep-equal library.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

export async function updatePlatformSetting(input: {
  key: string;
  value: SettingValue;
}): Promise<ActionResult> {
  const definition = getSettingDefinition(input.key);
  if (!definition) return { ok: false, error: "Unknown setting key." };

  const actor = await requireActor(definition, "edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  const validated = validateValue(input.key, input.value);
  if (!validated.ok) return validated;
  const isSecret = definition.type === "secret";

  try {
    const existing = await prisma.platformSetting.findUnique({
      where: { key: input.key },
    });
    // A secret's stored "before" is already ciphertext (or absent), so it
    // never equals the freshly-validated plaintext — every submit with a
    // non-empty value is treated as a real change, which matches the UI:
    // the client never has the current value to diff against locally.
    if (!isSecret) {
      const before = existing?.value ?? definition.defaultValue;
      if (sameValue(before, validated.value)) return { ok: true };
    }

    const storedValue = isSecret
      ? encryptSecret(validated.value as string)
      : (validated.value as Prisma.InputJsonValue);

    await prisma.platformSetting.upsert({
      where: { key: input.key },
      update: {
        value: storedValue as Prisma.InputJsonValue,
        updatedBy: actor.session.user.id,
      },
      create: {
        key: input.key,
        value: storedValue as Prisma.InputJsonValue,
        updatedBy: actor.session.user.id,
      },
    });

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "settings.updated",
      entity: "PlatformSetting",
      entityId: input.key,
      // Secret plaintext must never land in the audit trail — the "changes"
      // payload is otherwise a straight admin-facing diff, but this is the
      // one setting type where "diff" itself has to be lossy.
      changes: isSecret
        ? { from: existing ? "(secret set)" : "(unset)", to: "(secret set)" }
        : { from: existing?.value ?? definition.defaultValue, to: validated.value },
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
  const definition = getSettingDefinition(input.key);
  if (!definition) return { ok: false, error: "Unknown setting key." };

  const actor = await requireActor(definition, "edit");
  if ("error" in actor) return { ok: false, error: actor.error };

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
      // A secret's stored value is already ciphertext, never plaintext, but
      // it's still masked here for the same reason updatePlatformSetting
      // masks its diff: the audit log is read by more people, kept longer,
      // and sometimes exported, so it shouldn't carry even the encrypted
      // envelope as an existence/update-frequency signal.
      changes:
        definition.type === "secret"
          ? { from: "(secret set)", to: "(unset)" }
          : { from: existing.value, to: definition.defaultValue },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("[admin] resetPlatformSetting failed:", error);
    return { ok: false, error: "The setting could not be reset. Try again." };
  }
}
