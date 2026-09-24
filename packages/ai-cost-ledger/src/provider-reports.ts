import { z } from "zod";
import { MICROS_PER_UNIT, assertMicrosInRange, usdDecimalToMicros } from "./money";
import { normalizeModelKey, utcDay, type Page, type ProviderCostLine } from "./reconcile";

/**
 * Parsers for provider cost-report pages (issue #592). Pure: they turn one
 * already-fetched JSON page into `ProviderCostLine`s plus the next cursor.
 * The HTTP call, the admin credential and retries stay server-side in the
 * admin console. Schemas are deliberately tolerant of extra fields and
 * strict about the ones the money depends on — an unparseable amount fails
 * the fetch (`provider_unavailable`) rather than being read as $0.
 */

/**
 * Decimal **cents** string → micros (1 cent = 10 000 micros), rounding
 * half-away-from-zero at the 5th fractional digit. Anthropic's cost report
 * gives amounts in the lowest currency unit as decimal text.
 */
export function centsDecimalToMicros(amount: string): bigint {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) throw new TypeError(`not a decimal cents amount: "${amount}"`);
  const [, sign, whole, frac = ""] = match;
  const padded = (frac + "00000").slice(0, 5);
  let micros = BigInt(whole) * (MICROS_PER_UNIT / BigInt("100")) + BigInt(padded.slice(0, 4));
  if (Number(padded[4]) >= 5) micros += BigInt("1");
  return assertMicrosInRange(sign ? -micros : micros);
}

// ─── Anthropic: GET /v1/organizations/cost_report ────────────────────────

const AnthropicCostResultSchema = z
  .object({
    amount: z.string(),
    currency: z.string(),
    cost_type: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    service_tier: z.string().nullable().optional(),
    token_type: z.string().nullable().optional(),
    context_window: z.string().nullable().optional(),
    inference_geo: z.string().nullable().optional(),
    workspace_id: z.string().nullable().optional(),
  })
  .passthrough();

export const AnthropicCostReportPageSchema = z
  .object({
    data: z.array(
      z
        .object({
          starting_at: z.string().datetime({ offset: true }),
          ending_at: z.string().datetime({ offset: true }),
          results: z.array(AnthropicCostResultSchema),
        })
        .passthrough(),
    ),
    has_more: z.boolean(),
    next_page: z.string().nullable().optional(),
  })
  .passthrough();

export function parseAnthropicCostReportPage(json: unknown, accountKey: string): Page<ProviderCostLine> {
  const page = AnthropicCostReportPageSchema.parse(json);
  const items: ProviderCostLine[] = [];
  for (const bucket of page.data) {
    const day = utcDay(new Date(bucket.starting_at));
    for (const r of bucket.results) {
      if (r.currency.toUpperCase() !== "USD") throw new TypeError(`unexpected currency ${r.currency}`);
      items.push({
        provider: "anthropic",
        accountKey,
        day,
        modelKey: normalizeModelKey(r.model),
        lineKey: [r.cost_type, r.token_type, r.description, r.context_window, r.inference_geo, r.workspace_id]
          .map((v) => v ?? "")
          .join("|"),
        pricingTier: r.service_tier ?? null,
        amountMicros: centsDecimalToMicros(r.amount),
      });
    }
  }
  return { items, nextCursor: page.has_more ? (page.next_page ?? null) : null };
}

// ─── OpenAI: GET /v1/organization/costs ──────────────────────────────────

const OpenAiCostResultSchema = z
  .object({
    amount: z.object({ value: z.number().finite(), currency: z.string() }).passthrough(),
    line_item: z.string().nullable().optional(),
    project_id: z.string().nullable().optional(),
  })
  .passthrough();

export const OpenAiCostsPageSchema = z
  .object({
    data: z.array(
      z
        .object({
          start_time: z.number().int(),
          end_time: z.number().int(),
          results: z.array(OpenAiCostResultSchema),
        })
        .passthrough(),
    ),
    has_more: z.boolean(),
    next_page: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * OpenAI line items read like `"gpt-4o-mini-2024-07-18, input"` — model,
 * then the billed dimension. Anything without that shape (tool calls,
 * storage) is kept whole as its own key rather than guessed at.
 */
function openAiModelOf(lineItem: string | null | undefined): string {
  if (!lineItem) return normalizeModelKey(null);
  const comma = lineItem.indexOf(",");
  return normalizeModelKey(comma > 0 ? lineItem.slice(0, comma) : lineItem);
}

export function parseOpenAiCostsPage(json: unknown, accountKey: string): Page<ProviderCostLine> {
  const page = OpenAiCostsPageSchema.parse(json);
  const items: ProviderCostLine[] = [];
  for (const bucket of page.data) {
    const day = utcDay(new Date(bucket.start_time * 1000));
    for (const r of bucket.results) {
      if (r.amount.currency.toUpperCase() !== "USD") throw new TypeError(`unexpected currency ${r.amount.currency}`);
      items.push({
        provider: "openai",
        accountKey,
        day,
        modelKey: openAiModelOf(r.line_item),
        lineKey: [r.line_item, r.project_id].map((v) => v ?? "").join("|"),
        pricingTier: null,
        // The API returns dollars as a JSON number; 7 fixed digits is below
        // a micro, so the only rounding is the one usdDecimalToMicros does.
        amountMicros: usdDecimalToMicros(r.amount.value.toFixed(7)),
      });
    }
  }
  return { items, nextCursor: page.has_more ? (page.next_page ?? null) : null };
}
