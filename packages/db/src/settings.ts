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

export type SettingGroup = "presentation" | "operations" | "features" | "email" | "ai";

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

/**
 * Allow-listed chat/completion models per provider, for the `<app>.ai.*`
 * select settings below — mirrors apps/admin/lib/ai-providers.ts's catalog
 * pattern (display metadata for a fixed provider list), but for text
 * models rather than fal/kling/elevenlabs render providers, which stay
 * env-only (see issue #501). Drawn from the model ids already in use
 * elsewhere in the repo, not invented.
 */
const OPENAI_CHAT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"] as const;
const ANTHROPIC_CHAT_MODELS = [
  "claude-3-5-sonnet-latest",
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-opus-5",
] as const;

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
  {
    key: "resumatch.aiMonthlyBudgetUsd",
    label: "ResuMatch AI monthly budget",
    description:
      "Monthly AI spend ceiling in USD, applied to every ResuMatch workspace. Overrides RESUMATCH_AI_MONTHLY_BUDGET_USD while set; reset to fall back to the env var. 0 freezes AI spend. ResuMatch reads this over the internal settings API and may take up to a minute to pick up a change.",
    group: "operations",
    scope: "resumatch",
    type: "number",
    // Shown in the console only. ResuMatch ignores the catalog default and
    // uses its own env var until an admin sets an override (see
    // @asafarim/settings-client), so this mirrors the env default in
    // apps/resumatch/lib/env.ts rather than changing behavior.
    defaultValue: 20,
    min: 0,
    max: 10000,
    unit: "USD",
    highImpact: true,
  },
  // ── Outbound email (SMTP) ──────────────────────────────────────────────
  // One relay for the whole platform: every mail on the platform goes
  // through @asafarim/auth's mailer. Each key is "admin override, else its
  // env var" — independently, so fixing just the From address doesn't mean
  // re-entering the whole relay config. The catalog defaults below are shown
  // in the console only and mirror the env defaults; they never replace an
  // env var that's set.
  {
    key: "email.smtp.host",
    label: "SMTP host",
    description: "Outgoing mail relay hostname. Falls back to SMTP_HOST while unset.",
    group: "email",
    scope: "platform",
    type: "string",
    defaultValue: "",
    maxLength: 253,
    highImpact: true,
  },
  {
    key: "email.smtp.port",
    label: "SMTP port",
    description: "Relay port — usually 465 (TLS) or 587 (STARTTLS). Falls back to SMTP_PORT while unset.",
    group: "email",
    scope: "platform",
    type: "number",
    defaultValue: 465,
    min: 1,
    max: 65535,
    highImpact: true,
  },
  {
    key: "email.smtp.secure",
    label: "SMTP implicit TLS",
    description: "On for port 465 (TLS from the first byte); off for 587, which upgrades via STARTTLS. Falls back to SMTP_SECURE while unset.",
    group: "email",
    scope: "platform",
    type: "boolean",
    defaultValue: true,
    highImpact: true,
  },
  {
    key: "email.smtp.user",
    label: "SMTP username",
    description: "Relay login. Falls back to SMTP_USER while unset.",
    group: "email",
    scope: "platform",
    type: "string",
    defaultValue: "",
    maxLength: 320,
    highImpact: true,
  },
  {
    key: "email.smtp.password",
    label: "SMTP password",
    description: "Relay password or provider API token. Encrypted at rest; never shown again once saved. Falls back to SMTP_PASSWORD while unset.",
    group: "email",
    scope: "platform",
    type: "secret",
    defaultValue: "",
    maxLength: 1024,
  },
  {
    key: "email.smtp.from",
    label: "From address",
    description: 'Sender on every platform email, e.g. "ASafariM <noreply@asafarim.com>". Falls back to SMTP_FROM while unset.',
    group: "email",
    scope: "platform",
    type: "string",
    defaultValue: "",
    maxLength: 320,
    highImpact: true,
  },
  {
    key: "email.smtp.replyTo",
    label: "Reply-To address",
    description: "Optional default Reply-To for platform email. Flows that set their own (e.g. the contact form replies to the visitor) keep theirs. Empty means none.",
    group: "email",
    scope: "platform",
    type: "string",
    defaultValue: "",
    maxLength: 320,
  },
  // ── AI providers (LLM keys + per-app model selection) ──────────────────
  // Shared keys: the whole platform authenticates OpenAI/Anthropic usage
  // with one key per provider today (matches OPENAI_API_KEY/ANTHROPIC_API_KEY
  // in .env.example), not per-app keys. Per-app *model* choice is a
  // separate concern from *authentication* and lives on its own scoped
  // keys below, so fixing a model doesn't touch the shared key and vice
  // versa. Render-provider keys (fal/kling/elevenlabs, see
  // apps/admin/lib/ai-providers.ts) stay env-only — out of scope per #501.
  {
    key: "ai.openai.apiKey",
    label: "OpenAI API key",
    description:
      "Shared platform OpenAI key. Falls back to OPENAI_API_KEY while unset. Used by every app whose AI provider is OpenAI.",
    group: "ai",
    scope: "platform",
    type: "secret",
    defaultValue: "",
    maxLength: 200,
  },
  {
    key: "ai.anthropic.apiKey",
    label: "Anthropic API key",
    description:
      "Shared platform Anthropic key. Falls back to ANTHROPIC_API_KEY while unset. Used by every app whose AI provider is Anthropic.",
    group: "ai",
    scope: "platform",
    type: "secret",
    defaultValue: "",
    maxLength: 200,
  },
  // AI cost reconciliation (#592). Admin keys read org-wide usage/cost
  // reports only; they are a different credential from the inference keys
  // above and are used solely by the admin console's reconciliation job.
  {
    key: "ai.openai.adminKey",
    label: "OpenAI admin key (cost reports)",
    description:
      "Read-only organization admin key for OpenAI's usage/cost API, used by AI cost reconciliation. Falls back to OPENAI_ADMIN_KEY while unset. Leave unset to report OpenAI as \"no provider API\".",
    group: "ai",
    scope: "admin",
    type: "secret",
    defaultValue: "",
    maxLength: 200,
  },
  {
    key: "ai.anthropic.adminKey",
    label: "Anthropic admin key (cost reports)",
    description:
      "Anthropic Admin API key (sk-ant-admin…) for the Usage & Cost API, used by AI cost reconciliation. Falls back to ANTHROPIC_ADMIN_KEY while unset.",
    group: "ai",
    scope: "admin",
    type: "secret",
    defaultValue: "",
    maxLength: 200,
  },
  {
    key: "ai.costReconciliation.driftBps",
    label: "AI cost drift threshold",
    description:
      "How far internal AI cost may differ from the provider's daily figure before a day is flagged, in basis points of the provider amount (500 = 5%). A $0.05 absolute floor always applies.",
    group: "ai",
    scope: "admin",
    type: "number",
    defaultValue: 500,
    min: 50,
    max: 5000,
    unit: "bps",
  },
  // Public AI Workbench tools (apps/web /tools, #673). Live generation is off
  // until an admin turns it on AND the deployment sets AI_TOOLS_MODE=live;
  // either one alone keeps every tool on its fixture examples. The env var
  // AI_TOOLS_KILL_SWITCH=1 stops live calls even if this is on.
  {
    key: "web.aiTools.liveEnabled",
    label: "AI tools — live generation",
    description:
      "Allow public AI tools on asafarim.com/tools to call the AI provider for visitors' own text. Off = examples only, no AI spend. Requires AI_TOOLS_MODE=live on the web deployment; AI_TOOLS_KILL_SWITCH=1 overrides this. Takes effect on the next run.",
    group: "ai",
    scope: "web",
    type: "boolean",
    defaultValue: false,
    highImpact: true,
  },
  {
    key: "web.aiTools.disabledTools",
    label: "AI tools — paused tools",
    description:
      "Tool slugs (e.g. requirements-to-test-plan) whose live runs are paused. Their pages and examples stay up; visitors see that the tool is paused.",
    group: "ai",
    scope: "web",
    type: "string[]",
    defaultValue: [],
    maxItems: 20,
    maxLength: 60,
  },
  {
    key: "resumatch.ai.openaiModel",
    label: "ResuMatch — OpenAI model",
    description:
      'Chat model ResuMatch\'s tailoring pipeline uses when RESUMATCH_AI_PROVIDER is "openai". Falls back to OPENAI_MODEL, then a known-good default, while unset.',
    group: "ai",
    scope: "resumatch",
    type: "select",
    defaultValue: "gpt-4o-mini",
    options: OPENAI_CHAT_MODELS,
  },
  {
    key: "resumatch.ai.anthropicModel",
    label: "ResuMatch — Anthropic model",
    description:
      'Chat model ResuMatch\'s tailoring pipeline uses when RESUMATCH_AI_PROVIDER is "anthropic". Falls back to ANTHROPIC_MODEL, then a known-good default, while unset.',
    group: "ai",
    scope: "resumatch",
    type: "select",
    defaultValue: "claude-3-5-sonnet-latest",
    options: ANTHROPIC_CHAT_MODELS,
  },
] as const;

/**
 * Only the settings an admin has actually set, for the given keys, in one
 * query — decrypted for secrets. Unset keys are absent from the map, so a
 * caller can layer "override, else env var" per key without the catalog
 * default ever shadowing its env var. Throws on DB failure; callers that
 * must keep working without the settings store catch and fall back.
 */
export async function getSettingOverrides(keys: readonly string[]): Promise<Map<string, SettingValue>> {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...keys] } } });
  const overrides = new Map<string, SettingValue>();
  for (const row of rows) {
    const definition = getSettingDefinition(row.key);
    if (!definition) continue;
    const { value, valid } = resolveEffectiveValue(definition, row);
    if (valid) overrides.set(row.key, value);
  }
  return overrides;
}

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
  "email",
  "ai",
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
