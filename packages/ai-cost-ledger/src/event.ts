import { z } from "zod";
import { toMicros } from "./money";
import { PricingSnapshotSchema } from "./pricing";
import { UsageSchema } from "./usage";
import { COST_EVENT_SCHEMA_VERSION } from "./version";

/**
 * The append-only AI cost event — see docs/adr/0003-ai-cost-event-contract.md.
 *
 * One row per provider call (or per reconciliation adjustment). Rows are
 * never updated after insert; a correction is a *new* row that points at
 * the one it corrects through `supersedesEventId`. Each app persists this
 * shape in its own isolated schema with a unique index on
 * `idempotencyKey`, which is what makes ingestion retry-safe.
 */

/** How the amount on this row was obtained. */
export const COST_SOURCES = ["provider_reported", "registry_estimate", "reconciled_adjustment", "unknown"] as const;
export type CostSource = (typeof COST_SOURCES)[number];

/** Whose provider credential paid for the call. */
export const CREDENTIAL_SOURCES = ["platform", "user_byok", "none"] as const;
export type CredentialSource = (typeof CREDENTIAL_SOURCES)[number];

/** `usage` = a provider call; `adjustment` = a signed correction to an earlier row. */
export const ENTRY_TYPES = ["usage", "adjustment"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/**
 * What happened to the call. `failed` is only recorded when the provider
 * still reported billable usage (e.g. a response that failed schema
 * validation after it was generated); a call that never reached the
 * provider spends nothing and writes no event.
 */
export const OUTCOMES = ["succeeded", "degraded", "failed", "cancelled"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * `provisional` — written from the per-response usage the app saw; the
 * provider may still report a different final figure.
 * `final` — the provider-reported or reconciled figure; not expected to move.
 * A provisional row is never flipped in place: reconciliation appends an
 * adjustment with `finality: "final"`.
 */
export const FINALITIES = ["provisional", "final"] as const;
export type Finality = (typeof FINALITIES)[number];

export const OWNER_TYPES = ["workspace", "user"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

/**
 * Metadata envelope. Operational facts only — keys are restricted to a
 * short snake/camel identifier and matched against a deny-list of names
 * that would indicate user content or secrets leaking in. Values are
 * scalars; no nested objects (the usual vector for smuggling a prompt).
 */
const FORBIDDEN_METADATA_KEY = /(prompt|response|completion|content|text|body|message|cv|resume|letter|description|instruction|api_?key|secret|token_value|password|authorization|email)/i;

export const MetadataSchema = z
  .record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/, "metadata keys are short identifiers"),
    z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]),
  )
  .superRefine((record, ctx) => {
    const keys = Object.keys(record);
    if (keys.length > 24) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "metadata may hold at most 24 keys" });
    }
    for (const key of keys) {
      if (FORBIDDEN_METADATA_KEY.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `metadata key "${key}" is not allowed — the ledger never stores user content or secrets`,
        });
      }
    }
  });

/** Accepts bigint | safe-integer number | integer string; always yields bigint. */
export const MicrosSchema = z
  .union([z.bigint(), z.number().int(), z.string().regex(/^-?\d+$/)])
  .transform((v, ctx) => {
    try {
      return toMicros(v);
    } catch (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
      return z.NEVER;
    }
  });

const Id = z.string().min(1).max(191);
const Label = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_.:-]*$/, "lowercase identifier");

export const CostEventWriteSchema = z
  .object({
    schemaVersion: z.literal(COST_EVENT_SCHEMA_VERSION).default(COST_EVENT_SCHEMA_VERSION),
    /** Deterministic per logical call; the database's unique index on it
     *  turns a retried write into a no-op instead of a double charge. */
    idempotencyKey: z.string().min(8).max(200),
    entryType: z.enum(ENTRY_TYPES).default("usage"),

    app: Label,
    ownerType: z.enum(OWNER_TYPES),
    ownerId: Id,
    /** The member/user who triggered the call — audit and "my activity"
     *  filters only, never a ranking dimension. */
    actorId: Id.nullable().default(null),

    /** e.g. `tailor`, `cover_letter`, `story`, `tts`, `ai_motion_clip`, `decompose`. */
    operation: Label,
    outcome: z.enum(OUTCOMES).default("succeeded"),
    finality: z.enum(FINALITIES).default("provisional"),

    /** Most specific durable entity this cost served. */
    subjectType: Label,
    subjectId: Id,
    parentSubjectType: Label.nullable().default(null),
    parentSubjectId: Id.nullable().default(null),
    /** Groups the separate line items of one user action (tailor + cover
     *  letter in one preview, story + TTS + clips of one render). */
    workflowId: Id.nullable().default(null),
    traceId: z.string().max(64).nullable().default(null),

    provider: Label,
    requestModel: z.string().max(160).nullable().default(null),
    /** The model the provider says actually answered (OTel `gen_ai.response.model`). */
    responseModel: z.string().min(1).max(160),
    providerRequestId: z.string().max(200).nullable().default(null),
    promptVersion: z.string().max(80).nullable().default(null),
    pricingTier: z.string().max(40).nullable().default(null),

    usage: UsageSchema.default([]),

    currency: z.literal("USD").default("USD"),
    /** Registry estimate at call time. null = not estimated. */
    estimatedCostMicros: MicrosSchema.nullable().default(null),
    /** Provider-billed amount, when the provider reported one. */
    actualCostMicros: MicrosSchema.nullable().default(null),
    /** Only for `entryType: "adjustment"`: signed delta applied on top of
     *  the superseded row's effective amount. */
    adjustmentDeltaMicros: MicrosSchema.nullable().default(null),
    costSource: z.enum(COST_SOURCES),
    credentialSource: z.enum(CREDENTIAL_SOURCES),
    pricingSnapshot: PricingSnapshotSchema.nullable().default(null),
    /** Deterministic/fixture path — genuine $0, not unknown. */
    fixture: z.boolean().default(false),

    supersedesEventId: Id.nullable().default(null),
    latencyMs: z.number().int().nonnegative().nullable().default(null),
    metadata: MetadataSchema.default({}),

    occurredAt: z.coerce.date(),
    finalizedAt: z.coerce.date().nullable().default(null),
  })
  .strict()
  .superRefine((e, ctx) => {
    const issue = (message: string, path: string[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    if ((e.parentSubjectType === null) !== (e.parentSubjectId === null)) {
      issue("parentSubjectType and parentSubjectId are set together", ["parentSubjectId"]);
    }
    if (e.finalizedAt && e.finalizedAt < e.occurredAt) {
      issue("finalizedAt cannot precede occurredAt", ["finalizedAt"]);
    }
    for (const field of ["estimatedCostMicros", "actualCostMicros"] as const) {
      const v = e[field];
      if (v !== null && v < BigInt("0")) issue("usage amounts are non-negative; use an adjustment for credits", [field]);
    }

    if (e.entryType === "adjustment") {
      if (!e.supersedesEventId) issue("an adjustment must reference supersedesEventId", ["supersedesEventId"]);
      if (e.adjustmentDeltaMicros === null) issue("an adjustment carries adjustmentDeltaMicros", ["adjustmentDeltaMicros"]);
      if (e.costSource !== "reconciled_adjustment") issue("adjustments use costSource reconciled_adjustment", ["costSource"]);
      if (e.usage.length > 0) issue("adjustments carry no usage; the superseded row already counted it", ["usage"]);
      return;
    }

    if (e.adjustmentDeltaMicros !== null) issue("only adjustments carry adjustmentDeltaMicros", ["adjustmentDeltaMicros"]);
    if (e.costSource === "reconciled_adjustment") issue("reconciled_adjustment is reserved for adjustment rows", ["costSource"]);

    if (e.fixture) {
      if (e.credentialSource !== "none") issue("fixture calls use no credential", ["credentialSource"]);
      if (e.costSource === "unknown") issue("a fixture call's cost is known: zero", ["costSource"]);
      if (e.estimatedCostMicros !== BigInt("0") && e.actualCostMicros !== BigInt("0")) {
        issue("fixture calls record a genuine zero amount", ["estimatedCostMicros"]);
      }
      return;
    }

    switch (e.costSource) {
      case "unknown":
        if (e.estimatedCostMicros !== null || e.actualCostMicros !== null) {
          issue("unknown cost carries no amount — never a placeholder 0", ["costSource"]);
        }
        break;
      case "registry_estimate":
        if (e.estimatedCostMicros === null) issue("registry_estimate requires estimatedCostMicros", ["estimatedCostMicros"]);
        if (!e.pricingSnapshot) issue("registry_estimate requires the pricing snapshot used", ["pricingSnapshot"]);
        break;
      case "provider_reported":
        if (e.actualCostMicros === null) issue("provider_reported requires actualCostMicros", ["actualCostMicros"]);
        break;
    }
  });

export type CostEventWrite = z.output<typeof CostEventWriteSchema>;
export type CostEventWriteInput = z.input<typeof CostEventWriteSchema>;

/** A persisted event: the write plus its server-assigned id and insert time. */
export type CostEvent = CostEventWrite & { id: string; recordedAt: Date };

/** Validate + normalize a write; throws a ZodError listing every violated rule. */
export function parseCostEventWrite(input: CostEventWriteInput): CostEventWrite {
  return CostEventWriteSchema.parse(input);
}

/**
 * Deterministic idempotency key. Prefer a provider request id (truly
 * stable across a retried write); otherwise a caller-generated id minted
 * once per logical call, before any retry loop.
 */
export function buildIdempotencyKey(app: string, operation: string, ...parts: (string | number)[]): string {
  const key = [app, operation, ...parts.map(String)].join(":");
  if (key.length > 200) throw new RangeError("idempotency key exceeds 200 characters");
  return key;
}
