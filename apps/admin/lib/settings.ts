import { prisma } from "@asafarim/db";

/**
 * Typed, bounded platform-setting catalog.
 *
 * Only keys declared here can ever be read from or written to the
 * PlatformSetting table — the settings surface is NOT a free-form
 * key/value editor, must never hold secrets, and cannot affect the
 * authorization model (roles/permissions live in their own tables).
 * Environment configuration (URLs, credentials) is read-only in the UI.
 */

export type SettingValue = boolean | string;

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  group: "presentation" | "operations" | "features";
  type: "boolean" | "string" | "text";
  defaultValue: SettingValue;
  maxLength?: number;
  /** High-impact settings get an explicit confirmation step in the UI. */
  highImpact?: boolean;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: "platform.tagline",
    label: "Platform tagline",
    description: "Short line describing the platform, available to app headers/footers.",
    group: "presentation",
    type: "string",
    defaultValue: "Digital craftsmanship platform",
    maxLength: 160,
  },
  {
    key: "platform.announcement",
    label: "Announcement banner",
    description:
      "Optional platform-wide announcement text. Empty means no banner.",
    group: "presentation",
    type: "text",
    defaultValue: "",
    maxLength: 300,
  },
  {
    key: "maintenance.enabled",
    label: "Maintenance mode banner",
    description:
      "Signals scheduled maintenance to visitors. Presentation only — it does not disable routes or weaken authorization.",
    group: "operations",
    type: "boolean",
    defaultValue: false,
    highImpact: true,
  },
  {
    key: "maintenance.message",
    label: "Maintenance message",
    description: "Text shown while the maintenance banner is enabled.",
    group: "operations",
    type: "text",
    defaultValue: "Scheduled maintenance in progress.",
    maxLength: 300,
  },
  {
    key: "registration.open",
    label: "Registration open",
    description:
      "Whether new self-service sign-ups are accepted. Existing sessions and sign-ins are unaffected.",
    group: "features",
    type: "boolean",
    defaultValue: true,
    highImpact: true,
  },
] as const;

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}

export interface EffectiveSetting {
  definition: SettingDefinition;
  value: SettingValue;
  /** True when the value comes from the database rather than the default. */
  overridden: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** Catalog defaults merged with database overrides. Throws on DB failure. */
export async function getEffectiveSettings(): Promise<EffectiveSetting[]> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: SETTING_DEFINITIONS.map((d) => d.key) } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return SETTING_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);
    const raw = row?.value;
    const valid =
      definition.type === "boolean"
        ? typeof raw === "boolean"
        : typeof raw === "string";
    return {
      definition,
      value: valid ? (raw as SettingValue) : definition.defaultValue,
      overridden: Boolean(row && valid),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}
