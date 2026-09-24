import "server-only";
import {
  collectPages,
  dayStart,
  parseAnthropicCostReportPage,
  parseOpenAiCostsPage,
  type Page,
  type ProviderCostAdapter,
  type ProviderCostLine,
  type ProviderFetchResult,
} from "@asafarim/ai-cost-ledger";
import { getSettingOverrides } from "@asafarim/db";

/**
 * Provider cost-report adapters for AI cost reconciliation (#592).
 *
 * Credentials: organization **admin** keys, read from the central settings
 * store (encrypted at rest) with an env fallback, only inside this module
 * and only for the outbound request header. They are never logged, never
 * persisted in a run's `sources`, and never part of an error message —
 * failures surface as `HTTP <status>` or a shape error, nothing more.
 *
 * A provider with no admin key, or with no usage/cost API at all (the
 * Vionto render/TTS providers today), is `unsupported` — reported as
 * "no provider API", never as a fake match.
 */

export const DEFAULT_ACCOUNT_KEY = "default";
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "asafarim-admin/ai-cost-reconciliation";
const DAY_MS = 86_400_000;

type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

class ProviderHttpError extends Error {}

async function getJson(fetchImpl: FetchLike, url: URL, headers: Record<string, string>): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { ...headers, "user-agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new ProviderHttpError(`HTTP ${response.status}`);
  return response.json();
}

/** Error text safe to persist: never the response body, never a header. */
function describeError(error: unknown): string {
  if (error instanceof ProviderHttpError) return error.message;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timed out";
  if (error instanceof Error && error.name === "ZodError") return "unexpected response shape";
  if (error instanceof Error && error.name === "PaginationLoopError") return "pagination loop";
  if (error instanceof RangeError) return error.message;
  return "request failed";
}

function windowBounds(window: { startDay: string; endDay: string }): { start: Date; end: Date } {
  return { start: dayStart(window.startDay), end: new Date(dayStart(window.endDay).getTime() + DAY_MS) };
}

async function fetchAll(
  fetchPage: (cursor: string | null) => Promise<Page<ProviderCostLine>>,
): Promise<ProviderFetchResult> {
  try {
    const { items, pages } = await collectPages(fetchPage, { maxPages: 50 });
    return { status: "ok", lines: items, pagesFetched: pages, fetchedAt: new Date() };
  } catch (error) {
    return { status: "unavailable", error: describeError(error) };
  }
}

export function createAnthropicAdapter(adminKey: string | null, fetchImpl: FetchLike = fetch): ProviderCostAdapter {
  return {
    provider: "anthropic",
    accountKey: DEFAULT_ACCOUNT_KEY,
    async fetchDailyCosts(window) {
      if (!adminKey) return { status: "unsupported", reason: "no Anthropic admin key configured" };
      const { start, end } = windowBounds(window);
      return fetchAll(async (cursor) => {
        const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
        url.searchParams.set("starting_at", start.toISOString());
        url.searchParams.set("ending_at", end.toISOString());
        url.searchParams.set("bucket_width", "1d");
        url.searchParams.append("group_by[]", "description");
        url.searchParams.set("limit", "31");
        if (cursor) url.searchParams.set("page", cursor);
        const json = await getJson(fetchImpl, url, { "x-api-key": adminKey, "anthropic-version": "2023-06-01" });
        return parseAnthropicCostReportPage(json, DEFAULT_ACCOUNT_KEY);
      });
    },
  };
}

export function createOpenAiAdapter(adminKey: string | null, fetchImpl: FetchLike = fetch): ProviderCostAdapter {
  return {
    provider: "openai",
    accountKey: DEFAULT_ACCOUNT_KEY,
    async fetchDailyCosts(window) {
      if (!adminKey) return { status: "unsupported", reason: "no OpenAI admin key configured" };
      const { start, end } = windowBounds(window);
      return fetchAll(async (cursor) => {
        const url = new URL("https://api.openai.com/v1/organization/costs");
        url.searchParams.set("start_time", String(Math.floor(start.getTime() / 1000)));
        url.searchParams.set("end_time", String(Math.floor(end.getTime() / 1000)));
        url.searchParams.set("bucket_width", "1d");
        url.searchParams.append("group_by", "line_item");
        url.searchParams.set("limit", "180");
        if (cursor) url.searchParams.set("page", cursor);
        const json = await getJson(fetchImpl, url, { authorization: `Bearer ${adminKey}` });
        return parseOpenAiCostsPage(json, DEFAULT_ACCOUNT_KEY);
      });
    },
  };
}

/**
 * Adapter boundary for providers with no billed-cost reporting API we can
 * consume yet (Vionto's fal.ai / Kling / ElevenLabs). Implementing one is
 * a new `ProviderCostAdapter` — the job, storage and UI need no change.
 */
export function createUnsupportedAdapter(provider: string, reason: string): ProviderCostAdapter {
  return {
    provider,
    accountKey: DEFAULT_ACCOUNT_KEY,
    async fetchDailyCosts() {
      return { status: "unsupported", reason };
    },
  };
}

/** Settings store first (rotatable without a redeploy), env var second. */
async function resolveAdminKeys(): Promise<{ openai: string | null; anthropic: string | null }> {
  let overrides = new Map<string, unknown>();
  try {
    overrides = await getSettingOverrides(["ai.openai.adminKey", "ai.anthropic.adminKey"]);
  } catch {
    // Settings store unreachable — fall through to env.
  }
  const pick = (key: string, env: string | undefined) => {
    const v = overrides.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : env?.trim() || null;
  };
  return {
    openai: pick("ai.openai.adminKey", process.env.OPENAI_ADMIN_KEY),
    anthropic: pick("ai.anthropic.adminKey", process.env.ANTHROPIC_ADMIN_KEY),
  };
}

export async function getProviderAdapters(): Promise<ProviderCostAdapter[]> {
  const keys = await resolveAdminKeys();
  return [
    createOpenAiAdapter(keys.openai),
    createAnthropicAdapter(keys.anthropic),
    createUnsupportedAdapter("fal", "fal.ai exposes no billed-cost report API"),
    createUnsupportedAdapter("kling", "Kling exposes no billed-cost report API"),
    createUnsupportedAdapter("elevenlabs", "ElevenLabs reports characters, not billed cost"),
  ];
}
