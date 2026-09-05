import { prisma } from "@asafarim/db";

/**
 * Typed, bounded platform-setting catalog.
 *
 * Only keys declared here can ever be read from or written to the
 * PlatformSetting table — the settings surface is NOT a free-form
 * key/value editor, must never hold secrets, and cannot affect the
 * authorization model (roles/permissions live in their own tables).
 * Environment configuration (URLs, credentials) is read-only in the UI.
 *
 * Adding a setting is one entry here: the page renders every type
 * generically and the server action validates from the same definition,
 * so no UI or validation code changes with a new key.
 */

export type SettingValue = boolean | string | number | string[];

export type SettingType =
  | "boolean"
  | "string"
  | "text"
  | "number"
  | "select"
  | "string[]"
  | "color";

export type SettingGroup = "presentation" | "operations" | "features";

/**
 * Which app a setting configures. Platform-wide keys use "platform"; the
 * rest use a key from the PLATFORM_APPS registry so the console can be
 * filtered per app as more apps grow configuration.
 */
export type SettingScope =
  | "platform"
  | "web"
  | "hub"
  | "showcase"
  | "admin"
  | "jobmatch";

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  group: SettingGroup;
  scope: SettingScope;
  type: SettingType;
  defaultValue: SettingValue;
  /** Applies to string/text/color, and per-item for string[]. */
  maxLength?: number;
  /** Inclusive bounds for `number`. */
  min?: number;
  max?: number;
  /** Unit suffix rendered beside a number input, e.g. "days". */
  unit?: string;
  /** The allow-listed values a `select` may hold. */
  options?: readonly string[];
  /** Cap on the number of entries in a `string[]`. */
  maxItems?: number;
  /** High-impact settings get an explicit confirmation step in the UI. */
  highImpact?: boolean;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: "platform.tagline",
    label: "Platform tagline",
    description: "Short line describing the platform, available to app headers/footers.",
    group: "presentation",
    scope: "platform",
    type: "string",
    defaultValue: "Digital craftsmanship platform",
    maxLength: 160,
  },
  {
    key: "platform.announcement",
    label: "Announcement banner",
    description: "Optional platform-wide announcement text. Empty means no banner.",
    group: "presentation",
    scope: "platform",
    type: "text",
    defaultValue: "",
    maxLength: 300,
  },
  {
    key: "platform.accent",
    label: "Announcement accent colour",
    description:
      "Hex colour used for the announcement banner accent. Presentation only.",
    group: "presentation",
    scope: "platform",
    type: "color",
    defaultValue: "#e0a458",
  },
  {
    key: "maintenance.enabled",
    label: "Maintenance mode banner",
    description:
      "Signals scheduled maintenance to visitors. Presentation only — it does not disable routes or weaken authorization.",
    group: "operations",
    scope: "platform",
    type: "boolean",
    defaultValue: false,
    highImpact: true,
  },
  {
    key: "maintenance.message",
    label: "Maintenance message",
    description: "Text shown while the maintenance banner is enabled.",
    group: "operations",
    scope: "platform",
    type: "text",
    defaultValue: "Scheduled maintenance in progress.",
    maxLength: 300,
  },
  {
    key: "console.pageSize",
    label: "Console page size",
    description:
      "Rows per page in console tables. Larger pages mean heavier queries on the shared database.",
    group: "operations",
    scope: "admin",
    type: "number",
    defaultValue: 20,
    min: 10,
    max: 100,
    unit: "rows",
  },
  {
    key: "console.exportRetentionNote",
    label: "Export retention policy",
    description:
      "Shown beside CSV export links. State how long exported personal data may be kept.",
    group: "operations",
    scope: "admin",
    type: "string",
    defaultValue: "Delete exported personal data within 30 days.",
    maxLength: 160,
  },
  {
    key: "registration.open",
    label: "Registration open",
    description:
      "Whether new self-service sign-ups are accepted. Existing sessions and sign-ins are unaffected.",
    group: "features",
    scope: "platform",
    type: "boolean",
    defaultValue: true,
    highImpact: true,
  },
  {
    key: "registration.mode",
    label: "Registration mode",
    description:
      "How new accounts are admitted while registration is open. Presentation of the sign-up route only — it never widens authorization.",
    group: "features",
    scope: "hub",
    type: "select",
    defaultValue: "open",
    options: ["open", "invite-only", "waitlist"],
    highImpact: true,
  },
  {
    key: "showcase.featuredApps",
    label: "Featured apps",
    description:
      "App keys highlighted first on Showcase, in order. Unknown keys are ignored by the site.",
    group: "presentation",
    scope: "showcase",
    type: "string[]",
    defaultValue: ["vionto", "testora", "appbuilder"],
    maxItems: 6,
    maxLength: 40,
  },
] as const;

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}

/** Scopes that actually have settings, in a stable display order. */
export const SETTING_SCOPES: readonly SettingScope[] = [
  "platform",
  "hub",
  "showcase",
  "admin",
  "web",
].filter((scope) =>
  SETTING_DEFINITIONS.some((definition) => definition.scope === scope)
) as SettingScope[];

export const SETTING_GROUPS: readonly SettingGroup[] = [
  "presentation",
  "operations",
  "features",
];

/**
 * Whether a stored value still matches its definition.
 *
 * A definition can change shape (a select gains/loses an option, a number's
 * bounds tighten) while a row written under the old shape is still in the
 * table — those fall back to the default rather than rendering something
 * the editor could not have produced.
 */
export function isValidValue(
  definition: SettingDefinition,
  raw: unknown
): raw is SettingValue {
  switch (definition.type) {
    case "boolean":
      return typeof raw === "boolean";
    case "number":
      return (
        typeof raw === "number" &&
        Number.isFinite(raw) &&
        (definition.min === undefined || raw >= definition.min) &&
        (definition.max === undefined || raw <= definition.max)
      );
    case "select":
      return typeof raw === "string" && (definition.options ?? []).includes(raw);
    case "string[]":
      return Array.isArray(raw) && raw.every((item) => typeof item === "string");
    default:
      return typeof raw === "string";
  }
}

export interface EffectiveSetting {
  definition: SettingDefinition;
  value: SettingValue;
  /** True when the value comes from the database rather than the default. */
  overridden: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
  /** Email of the admin who last wrote it, when still resolvable. */
  updatedByEmail: string | null;
}

/** Catalog defaults merged with database overrides. Throws on DB failure. */
export async function getEffectiveSettings(): Promise<EffectiveSetting[]> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: SETTING_DEFINITIONS.map((d) => d.key) } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const editorIds = [
    ...new Set(rows.map((row) => row.updatedBy).filter((id): id is string => Boolean(id))),
  ];
  const editors = editorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: editorIds } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map(editors.map((user) => [user.id, user.email]));

  return SETTING_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);
    const raw = row?.value;
    const valid = row !== undefined && isValidValue(definition, raw);
    return {
      definition,
      value: valid ? (raw as SettingValue) : definition.defaultValue,
      overridden: valid,
      updatedAt: valid ? (row?.updatedAt ?? null) : null,
      updatedBy: valid ? (row?.updatedBy ?? null) : null,
      updatedByEmail: valid && row?.updatedBy ? (emailById.get(row.updatedBy) ?? null) : null,
    };
  });
}

/** Human-readable rendering of a value, used in confirmations and audit copy. */
export function formatSettingValue(value: SettingValue): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(empty)";
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (value === "") return "(empty)";
  return String(value);
}
