import { prisma } from "./client";
import { decryptSecret, isSecretEnvelope } from "./secret-cipher";

/**
 * Typed, bounded platform-setting catalog and read-side helpers, shared by
 * every app on the platform database.
 *
 * Only keys declared here can ever be read from or written to the
 * PlatformSetting table — the settings surface is NOT a free-form
 * key/value editor, must never hold plaintext secrets, and cannot affect
 * the authorization model (roles/permissions live in their own tables).
 * Environment configuration (URLs, credentials) is read-only in the UI.
 *
 * The write path (validation, RBAC, audit) stays in the Admin app's
 * `app/(admin)/settings/actions.ts` — only Admin's UI can change a
 * setting. Everything here is read-only: any app that already shares
 * `@asafarim/db` (web, hub, showcase, vionto, edumatch, timelineai) can
 * import this module directly instead of reimplementing "check the row,
 * fall back to default" from scratch.
 */

/** Arbitrary structured data for `json`-typed settings. */
export type SettingJsonValue = { [key: string]: unknown } | unknown[];

export type SettingValue = boolean | string | number | string[] | SettingJsonValue;

export type SettingType =
  | "boolean"
  | "string"
  | "text"
  | "number"
  | "select"
  | "string[]"
  | "color"
  | "secret"
  | "json";

export type SettingGroup = "presentation" | "operations" | "features";

/**
 * Which app a setting configures. Platform-wide keys use "platform"; the
 * rest use a key from the PLATFORM_APPS registry (`@asafarim/auth/apps`)
 * so the console can be filtered per app as more apps grow configuration.
 *
 * Kept as a literal union (rather than imported from PLATFORM_APPS, whose
 * `key` is typed as `string`) so a definition's `scope` is checked at
 * compile time, and so this module has no dependency on `@asafarim/auth`.
 * `apps/admin/lib/settings.test.ts` asserts this stays a superset of every
 * active PLATFORM_APPS key, so an app added there without a matching entry
 * here fails that test instead of silently falling out of scope.
 *
 * "coming-soon" apps are deliberately excluded — they have no running
 * surface to configure yet.
 */
export type SettingScope =
  | "platform"
  | "web"
  | "hub"
  | "showcase"
  | "admin"
  | "vionto"
  | "testora"
  | "appbuilder"
  | "devtools"
  | "edumatch"
  | "timelineai"
  | "labs"
  | "resumatch"
  | "tasksai";

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
  /**
   * Marks a non-`secret`-typed setting as still sensitive enough to require
   * `settings.secrets.{view,edit}` instead of the base `settings.{view,edit}`
   * — e.g. `stripe.mode`, where flipping live/test doesn't hold a
   * credential itself but gates one. Every `type: "secret"` definition is
   * implicitly sensitive; this flag is only for the non-secret case.
   */
  sensitive?: boolean;
  /**
   * Short guidance shown under a `json` editor (e.g. the expected shape).
   * Not full JSON Schema validation — a human hint only, structural
   * validation is per-consumer.
   */
  jsonHint?: string;
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

/**
 * Whether a setting requires `settings.secrets.{view,edit}` instead of the
 * base `settings.{view,edit}` — every `secret`-typed definition, plus any
 * non-secret definition explicitly flagged `sensitive: true`.
 */
export function isSensitiveSetting(definition: SettingDefinition): boolean {
  return definition.type === "secret" || definition.sensitive === true;
}

/** Scopes that actually have settings, in a stable display order. */
export const SETTING_SCOPES: readonly SettingScope[] = [
  "platform",
  "hub",
  "showcase",
  "admin",
  "web",
  "vionto",
  "testora",
  "appbuilder",
  "devtools",
  "edumatch",
  "timelineai",
  "labs",
  "resumatch",
  "tasksai",
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
    case "secret":
      // The stored raw value is the encrypted envelope, never plaintext — a
      // row that isn't a recognizable envelope (e.g. written before this
      // type existed) falls back to the catalog default rather than being
      // passed to decryptSecret, which would throw.
      return isSecretEnvelope(raw);
    case "json":
      // Structural validation (shape, required fields) is per-consumer, not
      // generic here — this only guards against a row that isn't an
      // object/array at all (e.g. a stray primitive from manual DB edits).
      return typeof raw === "object" && raw !== null;
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

/** Shared row→EffectiveSetting resolution, used by both bulk and single lookups. */
function resolveEffectiveValue(
  definition: SettingDefinition,
  row: { value: unknown } | undefined
): { value: SettingValue; valid: boolean } {
  const raw = row?.value;
  const valid = row !== undefined && isValidValue(definition, raw);
  if (!valid) return { value: definition.defaultValue, valid: false };

  if (definition.type === "secret") {
    try {
      return { value: decryptSecret(raw as string), valid: true };
    } catch (error) {
      // A row that looks like an envelope but fails to decrypt (wrong
      // SETTINGS_ENCRYPTION_KEY, corrupted data) must not crash the caller
      // — fall back to the default and let the key mismatch surface as
      // "not set" rather than a 500.
      console.error(`[settings] failed to decrypt secret setting "${definition.key}":`, error);
      return { value: definition.defaultValue, valid: false };
    }
  }
  return { value: raw as SettingValue, valid: true };
}

/**
 * Catalog defaults merged with database overrides for every setting.
 * Throws on DB failure.
 *
 * Server-only: for `secret`-type settings, `value` is decrypted plaintext.
 * Callers must never forward it into a Client Component prop — pass
 * `overridden` instead, which is the only signal the browser is allowed to
 * see for a secret.
 *
 * Bulk lookup, used by Admin's settings page. Most other consumers want a
 * single key — see `getEffectiveSetting` / `getSetting` / `getBooleanSetting`
 * / `getNumberSetting` below.
 */
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
    const { value, valid } = resolveEffectiveValue(definition, row);
    return {
      definition,
      value,
      overridden: valid,
      updatedAt: valid ? (row?.updatedAt ?? null) : null,
      updatedBy: valid ? (row?.updatedBy ?? null) : null,
      updatedByEmail: valid && row?.updatedBy ? (emailById.get(row.updatedBy) ?? null) : null,
    };
  });
}

/**
 * Catalog default merged with the database override for a single setting.
 * Throws on DB failure. `undefined` means the key isn't in the catalog at
 * all — not "unset" (an unset-but-cataloged key still resolves, to its
 * default). A single-row query, cheaper than `getEffectiveSettings()` for
 * any caller that only needs one key.
 */
export async function getEffectiveSetting(key: string): Promise<EffectiveSetting | undefined> {
  const definition = getSettingDefinition(key);
  if (!definition) return undefined;

  const row = await prisma.platformSetting.findUnique({ where: { key } });
  const { value, valid } = resolveEffectiveValue(definition, row ?? undefined);

  let updatedByEmail: string | null = null;
  if (valid && row?.updatedBy) {
    const editor = await prisma.user.findUnique({
      where: { id: row.updatedBy },
      select: { email: true },
    });
    updatedByEmail = editor?.email ?? null;
  }

  return {
    definition,
    value,
    overridden: valid,
    updatedAt: valid ? (row?.updatedAt ?? null) : null,
    updatedBy: valid ? (row?.updatedBy ?? null) : null,
    updatedByEmail,
  };
}

/**
 * Typed reads for operational parameters — the read-only counterpart to
 * Admin's settings UI. Every non-Admin app on the platform database should
 * reach for these instead of querying `PlatformSetting` directly.
 *
 * `getSetting` throws for a key that isn't in the catalog at all (a typo is
 * a programming error, not a runtime condition to degrade gracefully from).
 * The typed helpers below it are more forgiving: a DB error, decryption
 * failure, or a type mismatch between the catalog and the caller's
 * expectation all resolve to `fallback` rather than throwing, since these
 * exist specifically so a settings-DB hiccup doesn't take down unrelated
 * operational code paths in another app.
 */
export async function getSetting(key: string): Promise<SettingValue> {
  const definition = getSettingDefinition(key);
  if (!definition) {
    throw new Error(`Unknown setting key: "${key}".`);
  }
  const effective = await getEffectiveSetting(key);
  return effective?.value ?? definition.defaultValue;
}

export async function getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  try {
    const value = await getSetting(key);
    return typeof value === "boolean" ? value : fallback;
  } catch (error) {
    console.error(`[settings] getBooleanSetting("${key}") failed, using fallback:`, error);
    return fallback;
  }
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  try {
    const value = await getSetting(key);
    return typeof value === "number" ? value : fallback;
  } catch (error) {
    console.error(`[settings] getNumberSetting("${key}") failed, using fallback:`, error);
    return fallback;
  }
}

/** Human-readable rendering of a value, used in confirmations and audit copy. */
export function formatSettingValue(value: SettingValue): string {
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    return value.every((item) => typeof item === "string")
      ? value.join(", ")
      : JSON.stringify(value);
  }
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  if (value === "") return "(empty)";
  return String(value);
}
