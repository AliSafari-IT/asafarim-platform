import type { EffectiveSetting } from "@asafarim/db";
import type { SettingsWireResponse, WireSetting } from "@asafarim/settings-client";

/** App scope keys are lowercase slugs from the platform app registry. */
const SCOPE_PATTERN = /^[a-z0-9-]{1,40}$/;

export function parseScope(raw: string | null): { ok: true; scope: string | null } | { ok: false } {
  if (raw === null || raw === "") return { ok: true, scope: null };
  return SCOPE_PATTERN.test(raw) ? { ok: true, scope: raw } : { ok: false };
}

/**
 * Serializes effective settings for the internal settings API.
 *
 * With a scope, returns that app's settings plus platform-wide ones; without
 * one, every setting. Scope filtering is a convenience, not an access
 * boundary: every caller shares the one INTERNAL_API_SECRET, so the API has
 * no way to know which app is asking.
 *
 * A secret is built as `{ isSet }` from scratch — never by spreading the
 * effective setting — so its decrypted `value` can't be copied into the
 * response by accident.
 */
export function buildInternalSettingsPayload(
  effective: EffectiveSetting[],
  scope: string | null,
): SettingsWireResponse {
  const settings: WireSetting[] = effective
    .filter(({ definition }) => scope === null || definition.scope === scope || definition.scope === "platform")
    .map(({ definition, value, overridden }): WireSetting =>
      definition.type === "secret"
        ? { key: definition.key, scope: definition.scope, type: "secret", overridden, isSet: overridden }
        : { key: definition.key, scope: definition.scope, type: definition.type, overridden, value },
    );
  return { scope, settings };
}
