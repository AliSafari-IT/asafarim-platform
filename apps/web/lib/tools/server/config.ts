import "server-only";
import { getSettingOverrides } from "@asafarim/db";

/**
 * Runtime configuration for public-tool execution. Fails closed: anything
 * missing, unreadable, or unrecognized leaves live generation off, while
 * examples (fixtures) keep working.
 *
 * Layers, most restrictive wins:
 * 1. `AI_TOOLS_MODE` (env) — `off` (default) | `fixture` | `live`.
 *    `fixture` serves every run from the adapter's deterministic fixture
 *    (dev, CI, E2E); it never calls a provider.
 * 2. `AI_TOOLS_KILL_SWITCH=1` (env) — emergency stop for all live calls that
 *    doesn't depend on the database.
 * 3. Admin settings `web.aiTools.liveEnabled` (global, default off) and
 *    `web.aiTools.disabledTools` (per-tool slugs).
 * 4. A provider key: Admin's `ai.anthropic.apiKey`, else `ANTHROPIC_API_KEY`.
 */
export type ExecutionMode = "off" | "fixture" | "live";

export interface ToolRuntimeConfig {
  mode: ExecutionMode;
  /** Global live switch after env kill switch + Admin setting. */
  liveEnabled: boolean;
  disabledTools: ReadonlySet<string>;
  provider: { name: "anthropic"; model: string; apiKey: string } | null;
  /** Operator-facing reasons live is off; logged, never sent to the browser. */
  notes: string[];
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
const SETTING_LIVE = "web.aiTools.liveEnabled";
const SETTING_DISABLED = "web.aiTools.disabledTools";
const SETTING_ANTHROPIC_KEY = "ai.anthropic.apiKey";

type Env = Record<string, string | undefined>;
type Overrides = Map<string, unknown>;

/** Pure resolution, for tests. */
export function resolveRuntimeConfig(env: Env, overrides: Overrides | null): ToolRuntimeConfig {
  const notes: string[] = [];
  const rawMode = (env.AI_TOOLS_MODE ?? "off").trim().toLowerCase();
  let mode: ExecutionMode = "off";
  if (rawMode === "off" || rawMode === "fixture" || rawMode === "live") mode = rawMode;
  else notes.push(`unrecognized AI_TOOLS_MODE "${rawMode.slice(0, 20)}"; treating as off`);

  if (overrides === null) notes.push("settings unavailable; live disabled");
  const killed = env.AI_TOOLS_KILL_SWITCH === "1" || env.AI_TOOLS_KILL_SWITCH === "true";
  if (killed) notes.push("AI_TOOLS_KILL_SWITCH is set");
  const settingLive = overrides?.get(SETTING_LIVE) === true;
  if (overrides && !settingLive) notes.push(`${SETTING_LIVE} is off`);

  const disabledRaw = overrides?.get(SETTING_DISABLED);
  const disabledTools = new Set(Array.isArray(disabledRaw) ? disabledRaw.filter((s): s is string => typeof s === "string") : []);

  const providerName = (env.AI_TOOLS_PROVIDER ?? "anthropic").trim().toLowerCase();
  let provider: ToolRuntimeConfig["provider"] = null;
  if (providerName !== "anthropic") {
    notes.push(`unrecognized AI_TOOLS_PROVIDER "${providerName.slice(0, 20)}"`);
  } else {
    const override = overrides?.get(SETTING_ANTHROPIC_KEY);
    const apiKey = (typeof override === "string" && override) || env.ANTHROPIC_API_KEY || "";
    if (apiKey) {
      provider = { name: "anthropic", model: env.AI_TOOLS_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL, apiKey };
    } else {
      notes.push("no Anthropic API key configured");
    }
  }

  return {
    mode,
    liveEnabled: mode === "live" && !killed && settingLive && overrides !== null,
    disabledTools,
    provider,
    notes,
  };
}

/** Reads env + Admin overrides. Never throws; a DB failure disables live. */
export async function loadRuntimeConfig(env: Env = process.env): Promise<ToolRuntimeConfig> {
  let overrides: Overrides | null;
  try {
    overrides = await getSettingOverrides([SETTING_LIVE, SETTING_DISABLED, SETTING_ANTHROPIC_KEY]);
  } catch {
    overrides = null;
  }
  return resolveRuntimeConfig(env, overrides);
}
