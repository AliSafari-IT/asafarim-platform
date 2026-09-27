import type { TemporalValue, TimelineEventCandidate } from "@asafarim/timeline-contract";

/**
 * Handoffs from the public AI Workbench into the full apps (#678).
 *
 * The MVP ships the issue's documented safe fallback: the visitor downloads
 * a handoff file built from exactly what they reviewed and selected, signs
 * in to the destination, and imports it there. The destination validates it
 * again, shows exactly what will be created, and writes only after an
 * explicit confirmation — idempotently by `handoffId`. Nothing is placed in
 * a URL, nothing is persisted on the Web side, and an anonymous Web session
 * can't create or edit anything in another app.
 *
 * Dependency-free so every app (whatever its Zod version) runs the same
 * checks. Bump HANDOFF_VERSION or a payload version on any breaking change;
 * destinations reject versions they don't know with a recovery message.
 */
export const HANDOFF_VERSION = "asafarim-handoff/1";
export const HANDOFF_FILE_SUFFIX = ".asafarim-handoff.json";
/** A file older than this is refused: export it again from the tool. */
export const HANDOFF_TTL_DAYS = 7;
/** Destinations refuse bigger files before parsing. */
export const MAX_HANDOFF_BYTES = 512_000;

export const DESTINATIONS = ["testora", "tasksai", "timelineai"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const DESTINATION_NAMES: Record<Destination, string> = { testora: "Testora", tasksai: "TasksAI", timelineai: "TimelineAI" };

/** Where each destination's import page lives, relative to its origin. */
export const IMPORT_PATH = "/import/workbench";

export const PAYLOAD_VERSIONS = {
  testora: "testora-scenarios/1",
  tasksai: "tasksai-tasks/1",
  timelineai: "timelineai-events/1",
} as const satisfies Record<Destination, string>;

export interface HandoffSource {
  app: "web";
  tool: string;
  toolVersion: string;
  schemaVersion: string;
}

export interface HandoffEnvelope<D extends Destination = Destination> {
  handoffVersion: typeof HANDOFF_VERSION;
  /** Random, minted when the file is created. The destination's idempotency key. */
  handoffId: string;
  createdAt: string;
  expiresAt: string;
  source: HandoffSource;
  destination: D;
  payloadVersion: (typeof PAYLOAD_VERSIONS)[D];
  payload: PayloadFor<D>;
}

// ── Payloads ─────────────────────────────────────────────────────────────────
export type Basis = "extracted" | "constraint" | "inferred" | "recommendation";

/** Test scenarios for Testora: they arrive as pending scaffolds, never as passing tests. */
export interface TestoraScenariosPayload {
  title: string;
  summary: string;
  scenarios: {
    ref: string;
    title: string;
    category: string;
    priority: "high" | "medium" | "low";
    basis: "extracted" | "inferred";
    preconditions: string[];
    steps: string[];
    expected: string;
    /** Quoted requirement text the scenario traces to. */
    evidence: string[];
    assumption?: string;
  }[];
  questions: string[];
}

/** Tasks for TasksAI: no assignee, no due date. */
export interface TasksaiTasksPayload {
  title: string;
  objective: string;
  tasks: {
    ref: string;
    title: string;
    description: string;
    basis: Basis;
    evidence: string[];
    rationale?: string;
    effort?: { low: number; high: number; unit: "hours" | "days" };
    /** Refs of tasks this one waits for. */
    waitsFor: string[];
  }[];
  risks: string[];
  questions: string[];
}

/** TimelineAI's own events_extraction payload (@asafarim/timeline-contract). */
export interface TimelineaiEventsPayload {
  title: string;
  summary: string;
  kind: "events_extraction";
  events: TimelineEventCandidate[];
}

export type PayloadFor<D extends Destination> = D extends "testora"
  ? TestoraScenariosPayload
  : D extends "tasksai"
    ? TasksaiTasksPayload
    : TimelineaiEventsPayload;

export const LIMITS = { title: 200, text: 1_000, longText: 4_000, items: 100, list: 20, ref: 20 } as const;

// ── Building ─────────────────────────────────────────────────────────────────
export function buildHandoff<D extends Destination>(
  destination: D,
  source: HandoffSource,
  payload: PayloadFor<D>,
  options: { now?: Date; id?: string } = {}
): HandoffEnvelope<D> {
  const now = options.now ?? new Date();
  return {
    handoffVersion: HANDOFF_VERSION,
    handoffId: options.id ?? randomId(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_DAYS * 86_400_000).toISOString(),
    source,
    destination,
    payloadVersion: PAYLOAD_VERSIONS[destination],
    payload,
  };
}

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  throw new Error("A secure random source is required to create a handoff.");
}

// ── Validation (run by every destination before preview and again before import) ──
export type HandoffErrorCode = "too_large" | "not_json" | "not_handoff" | "unsupported_version" | "wrong_destination" | "expired" | "invalid_payload";

export type HandoffParseResult<D extends Destination> =
  | { ok: true; envelope: HandoffEnvelope<D> }
  | { ok: false; code: HandoffErrorCode; message: string; details?: string[] };

const RECOVERY: Record<HandoffErrorCode, string> = {
  too_large: "This file is too large to import. Export a smaller selection from the tool and try again.",
  not_json: "This isn't a handoff file. Download it again with the tool's \"Continue in\" button.",
  not_handoff: "This isn't an AI Workbench handoff file. Download it again with the tool's \"Continue in\" button.",
  unsupported_version: "This file was made by a newer or older version of the tool. Export it again from the tool page, then import the new file.",
  wrong_destination: "This file was made for a different app; nothing was imported here.",
  expired: `Handoff files work for ${HANDOFF_TTL_DAYS} days. Run the tool again, review the result, and export a new file.`,
  invalid_payload: "This file is damaged or was edited. Export it again from the tool; nothing was imported.",
};

export function parseHandoff<D extends Destination>(text: string, destination: D, now: Date = new Date()): HandoffParseResult<D> {
  const fail = (code: HandoffErrorCode, details?: string[], message = RECOVERY[code]): HandoffParseResult<D> => ({
    ok: false,
    code,
    message,
    ...(details?.length ? { details: details.slice(0, 10) } : {}),
  });
  if (byteLength(text) > MAX_HANDOFF_BYTES) return fail("too_large");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("not_json");
  }
  if (!isObject(data) || typeof data.handoffVersion !== "string") return fail("not_handoff");
  if (data.handoffVersion !== HANDOFF_VERSION) return fail("unsupported_version");
  if (typeof data.destination !== "string" || !(DESTINATIONS as readonly string[]).includes(data.destination)) return fail("invalid_payload", ["destination"]);
  if (data.destination !== destination) {
    const intended = DESTINATION_NAMES[data.destination as Destination];
    return fail("wrong_destination", undefined, `This file was made for ${intended}. Import it in ${intended} instead; nothing was imported here.`);
  }
  if (data.payloadVersion !== PAYLOAD_VERSIONS[destination]) return fail("unsupported_version");

  const errors: string[] = [];
  const v = new Validator(errors);
  v.pattern(data.handoffId, "handoffId", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const created = v.date(data.createdAt, "createdAt");
  const expires = v.date(data.expiresAt, "expiresAt");
  if (isObject(data.source)) {
    if (data.source.app !== "web") errors.push("source.app");
    v.text(data.source.tool, "source.tool", 60);
    v.text(data.source.toolVersion, "source.toolVersion", 30);
    v.text(data.source.schemaVersion, "source.schemaVersion", 40);
  } else errors.push("source");
  PAYLOAD_CHECKS[destination](data.payload, v);
  if (errors.length) return fail("invalid_payload", errors);
  if (created && expires && (expires.getTime() < now.getTime() || created.getTime() > now.getTime() + 5 * 60_000)) return fail("expired");
  return { ok: true, envelope: data as unknown as HandoffEnvelope<D> };
}

class Validator {
  constructor(private readonly errors: string[]) {}
  text(value: unknown, path: string, max: number, required = true): value is string {
    if (value === undefined && !required) return true;
    if (typeof value !== "string" || (required && !value.trim()) || value.length > max) {
      this.errors.push(path);
      return false;
    }
    return true;
  }
  pattern(value: unknown, path: string, re: RegExp) {
    if (typeof value !== "string" || !re.test(value)) this.errors.push(path);
  }
  date(value: unknown, path: string): Date | null {
    const d = typeof value === "string" ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) {
      this.errors.push(path);
      return null;
    }
    return d;
  }
  list(value: unknown, path: string, max: number, min = 0): value is unknown[] {
    if (!Array.isArray(value) || value.length > max || value.length < min) {
      this.errors.push(path);
      return false;
    }
    return true;
  }
  texts(value: unknown, path: string, maxItems: number, maxLength: number) {
    if (this.list(value, path, maxItems)) value.forEach((x, i) => this.text(x, `${path}[${i}]`, maxLength));
  }
  oneOf(value: unknown, path: string, options: readonly string[]) {
    if (typeof value !== "string" || !options.includes(value)) this.errors.push(path);
  }
  object(value: unknown, path: string): value is Record<string, unknown> {
    if (!isObject(value)) {
      this.errors.push(path);
      return false;
    }
    return true;
  }
}

const REF = /^[A-Za-z0-9_-]{1,20}$/;

const PAYLOAD_CHECKS: Record<Destination, (payload: unknown, v: Validator) => void> = {
  testora(p, v) {
    if (!v.object(p, "payload")) return;
    v.text(p.title, "payload.title", LIMITS.title);
    v.text(p.summary, "payload.summary", LIMITS.text, false);
    v.texts(p.questions, "payload.questions", LIMITS.list, LIMITS.text);
    if (!v.list(p.scenarios, "payload.scenarios", LIMITS.items, 1)) return;
    const refs = new Set<string>();
    p.scenarios.forEach((s, i) => {
      const at = `payload.scenarios[${i}]`;
      if (!v.object(s, at)) return;
      v.pattern(s.ref, `${at}.ref`, REF);
      if (typeof s.ref === "string" && refs.has(s.ref)) v.pattern("", `${at}.ref (duplicate)`, /x/);
      refs.add(String(s.ref));
      v.text(s.title, `${at}.title`, LIMITS.title);
      v.text(s.category, `${at}.category`, 40);
      v.oneOf(s.priority, `${at}.priority`, ["high", "medium", "low"]);
      v.oneOf(s.basis, `${at}.basis`, ["extracted", "inferred"]);
      v.texts(s.preconditions, `${at}.preconditions`, LIMITS.list, LIMITS.text);
      if (v.list(s.steps, `${at}.steps`, LIMITS.list, 1)) s.steps.forEach((x, j) => v.text(x, `${at}.steps[${j}]`, LIMITS.text));
      v.text(s.expected, `${at}.expected`, LIMITS.text);
      v.texts(s.evidence, `${at}.evidence`, 10, LIMITS.text);
      v.text(s.assumption, `${at}.assumption`, LIMITS.text, false);
      if (s.basis === "extracted" && Array.isArray(s.evidence) && s.evidence.length === 0) v.pattern("", `${at}.evidence (required)`, /x/);
      if (s.basis === "inferred" && !s.assumption) v.pattern("", `${at}.assumption (required)`, /x/);
    });
  },
  tasksai(p, v) {
    if (!v.object(p, "payload")) return;
    v.text(p.title, "payload.title", LIMITS.title);
    v.text(p.objective, "payload.objective", LIMITS.text, false);
    v.texts(p.risks, "payload.risks", LIMITS.list, LIMITS.text);
    v.texts(p.questions, "payload.questions", LIMITS.list, LIMITS.text);
    if (!v.list(p.tasks, "payload.tasks", LIMITS.items, 1)) return;
    const refs = new Set<string>();
    for (const t of p.tasks) if (isObject(t) && typeof t.ref === "string") refs.add(t.ref);
    const seen = new Set<string>();
    p.tasks.forEach((t, i) => {
      const at = `payload.tasks[${i}]`;
      if (!v.object(t, at)) return;
      v.pattern(t.ref, `${at}.ref`, REF);
      if (typeof t.ref === "string" && seen.has(t.ref)) v.pattern("", `${at}.ref (duplicate)`, /x/);
      seen.add(String(t.ref));
      v.text(t.title, `${at}.title`, LIMITS.title);
      v.text(t.description, `${at}.description`, LIMITS.longText, false);
      v.oneOf(t.basis, `${at}.basis`, ["extracted", "constraint", "inferred", "recommendation"]);
      v.texts(t.evidence, `${at}.evidence`, 10, LIMITS.text);
      v.text(t.rationale, `${at}.rationale`, LIMITS.text, false);
      if (t.effort !== undefined) {
        const e = t.effort;
        if (!isObject(e) || typeof e.low !== "number" || typeof e.high !== "number" || !(e.low > 0 && e.low <= e.high && e.high <= 1_000) || (e.unit !== "hours" && e.unit !== "days")) {
          v.pattern("", `${at}.effort`, /x/);
        }
      }
      if (v.list(t.waitsFor, `${at}.waitsFor`, LIMITS.list)) {
        t.waitsFor.forEach((ref, j) => {
          if (typeof ref !== "string" || !refs.has(ref) || ref === t.ref) v.pattern("", `${at}.waitsFor[${j}]`, /x/);
        });
      }
      // The contract has no assignee or due date; refuse files that add one.
      for (const key of ["assignee", "owner", "dueDate", "deadline"]) if (key in t) v.pattern("", `${at}.${key} (not allowed)`, /x/);
    });
  },
  timelineai(p, v) {
    if (!v.object(p, "payload")) return;
    v.text(p.title, "payload.title", LIMITS.title);
    v.text(p.summary, "payload.summary", LIMITS.text, false);
    if (p.kind !== "events_extraction") v.pattern("", "payload.kind", /x/);
    if (!v.list(p.events, "payload.events", LIMITS.items, 1)) return;
    p.events.forEach((e, i) => {
      const at = `payload.events[${i}]`;
      if (!v.object(e, at)) return;
      v.text(e.title, `${at}.title`, 200);
      v.text(e.description, `${at}.description`, 4_000, false);
      v.text(e.displayDate, `${at}.displayDate`, 64, false);
      for (const key of ["startAt", "endAt"] as const) if (e[key] !== undefined) v.date(e[key], `${at}.${key}`);
      if (e.temporalValue !== undefined && !isTemporalValue(e.temporalValue)) v.pattern("", `${at}.temporalValue`, /x/);
      v.oneOf(e.confidence, `${at}.confidence`, ["low", "medium", "high"]);
      if (typeof e.uncitedInference !== "boolean") v.pattern("", `${at}.uncitedInference`, /x/);
      if (v.list(e.citations, `${at}.citations`, 10)) {
        e.citations.forEach((c, j) => {
          if (!v.object(c, `${at}.citations[${j}]`)) return;
          v.text(c.label, `${at}.citations[${j}].label`, 200);
          v.text(c.excerpt, `${at}.citations[${j}].excerpt`, 500, false);
          if (c.url !== undefined) v.pattern("", `${at}.citations[${j}].url (not allowed)`, /x/);
        });
        if (e.citations.length === 0 && e.uncitedInference !== true) v.pattern("", `${at}.citations (required)`, /x/);
      }
    });
  },
};

const PRECISIONS = ["day", "month", "year", "quarter", "season", "decade", "century", "range", "unknown"];
function isTemporalValue(value: unknown, depth = 0): value is TemporalValue {
  if (!isObject(value) || depth > 2) return false;
  if (typeof value.precision !== "string" || !PRECISIONS.includes(value.precision)) return false;
  if (value.era !== "CE" && value.era !== "BCE") return false;
  if (typeof value.displayText !== "string" || !value.displayText || value.displayText.length > 120) return false;
  for (const k of ["year", "month", "day", "quarter"] as const) if (value[k] !== undefined && !Number.isInteger(value[k])) return false;
  for (const k of ["rangeStart", "rangeEnd"] as const) if (value[k] !== undefined && !isTemporalValue(value[k], depth + 1)) return false;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Deterministic, URL-safe key derived from a handoff id, for idempotent record ids. */
export function handoffKey(handoffId: string, length = 16): string {
  return handoffId.replace(/-/g, "").toLowerCase().slice(0, length);
}
