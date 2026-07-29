import type { IndexedTarget, SpecIndex } from "./specIndex";
import { normalizeText } from "./specIndex";

/**
 * M13 slice D — structured, evidence-linked conversation memory.
 *
 * The M13 contract is explicit that this is "not an opaque prose summary":
 * every fact names the message(s) that produced it and the specification
 * version it was true at, so it can be *checked* rather than trusted. This
 * module holds the pure shape and the invalidation rules; the durable row
 * lives in lib/repositories/conversationMemory.ts.
 *
 * Why invalidation is not optional: memory is the thing that makes "it is
 * still black" interpretable at all, and it is also the thing that would
 * confidently point a mutation at a page somebody deleted three turns ago.
 * `invalidateStaleFacts` runs on every recall against the CURRENT index, so
 * a fact can only survive if its target still exists and still holds the
 * value the fact was recorded against.
 */

export const MEMORY_LIMITS = {
  MAX_REFERENCES: 20,
  MAX_ASSUMPTIONS: 10,
  MAX_PREFERENCES: 10,
  MAX_PHRASE_CHARS: 120,
  MAX_STATEMENT_CHARS: 400,
  MAX_SOURCE_MESSAGE_IDS: 5,
} as const;

/**
 * A phrase the user used ("the title", "it") bound to the stable target it
 * was resolved to, plus the value that target held at the time.
 */
export interface MemoryReference {
  phrase: string;
  targetId: string;
  property: string;
  /** The value the target held when this reference was recorded — the staleness probe. */
  recordedValue: string | null;
  pageId?: string;
  componentId?: string;
  entityId?: string;
  fieldId?: string;
  sourceMessageIds: string[];
  specificationVersionNumber: number;
  recordedAt: string;
}

/** A reversible presentation default the assistant applied and told the user about ("I mapped 'blue' to the app palette"). */
export interface MemoryAssumption {
  statement: string;
  targetId?: string;
  sourceMessageIds: string[];
  specificationVersionNumber: number;
  recordedAt: string;
}

/** An app-relevant preference the user stated ("always use the brand palette"). */
export interface MemoryPreference {
  key: string;
  value: string;
  sourceMessageIds: string[];
  specificationVersionNumber: number;
  recordedAt: string;
}

export interface ConversationMemoryFacts {
  references: MemoryReference[];
  assumptions: MemoryAssumption[];
  preferences: MemoryPreference[];
}

export function emptyMemoryFacts(): ConversationMemoryFacts {
  return { references: [], assumptions: [], preferences: [] };
}

export type InvalidationReason =
  /** The target no longer exists in the current specification (page archived away, component removed, id renamed). */
  | "target_missing"
  /** The target exists but no longer holds the value the fact was recorded against — someone changed it since. */
  | "value_changed"
  /** Recorded against a specification version newer than the one being interpreted (a rollback happened). */
  | "version_ahead";

export interface InvalidatedFact {
  kind: "reference" | "assumption";
  /** `phrase` for a reference, `statement` for an assumption — enough to explain the drop without dumping the fact. */
  descriptor: string;
  targetId?: string;
  reason: InvalidationReason;
}

export interface RecalledMemory {
  facts: ConversationMemoryFacts;
  invalidated: InvalidatedFact[];
}

/**
 * Drops every fact that no longer holds against `index`, returning what
 * survived and why the rest didn't.
 *
 * A reference survives only if its `targetId` is still in the index AND the
 * target still holds `recordedValue` (compared normalized — a case/whitespace
 * difference is not a change). An assumption survives if it either carries
 * no target or its target still exists; assumptions are statements about a
 * decision, not about a value, so a later value change does not falsify one.
 * Preferences are target-free by construction and always survive.
 */
export function invalidateStaleFacts(
  facts: ConversationMemoryFacts,
  index: SpecIndex,
): RecalledMemory {
  const invalidated: InvalidatedFact[] = [];

  const references = facts.references.filter((reference) => {
    if (reference.specificationVersionNumber > index.specificationVersionNumber) {
      invalidated.push({ kind: "reference", descriptor: reference.phrase, targetId: reference.targetId, reason: "version_ahead" });
      return false;
    }
    const target = index.byTargetId.get(reference.targetId);
    if (!target) {
      invalidated.push({ kind: "reference", descriptor: reference.phrase, targetId: reference.targetId, reason: "target_missing" });
      return false;
    }
    if (!sameValue(target.value, reference.recordedValue)) {
      invalidated.push({ kind: "reference", descriptor: reference.phrase, targetId: reference.targetId, reason: "value_changed" });
      return false;
    }
    return true;
  });

  const assumptions = facts.assumptions.filter((assumption) => {
    if (assumption.specificationVersionNumber > index.specificationVersionNumber) {
      invalidated.push({ kind: "assumption", descriptor: assumption.statement, targetId: assumption.targetId, reason: "version_ahead" });
      return false;
    }
    if (assumption.targetId && !index.byTargetId.get(assumption.targetId)) {
      invalidated.push({ kind: "assumption", descriptor: assumption.statement, targetId: assumption.targetId, reason: "target_missing" });
      return false;
    }
    return true;
  });

  return { facts: { references, assumptions, preferences: facts.preferences }, invalidated };
}

function sameValue(current: string | null, recorded: string | null): boolean {
  if (current === null || recorded === null) return current === recorded;
  return normalizeText(current) === normalizeText(recorded);
}

/**
 * Records (or refreshes) a resolved reference, newest first and bounded.
 * De-duplicated on `phrase` + `targetId` so repeatedly saying "the title"
 * keeps one entry that tracks the latest value rather than accumulating a
 * history the model then has to disambiguate.
 */
export function rememberReference(
  facts: ConversationMemoryFacts,
  reference: MemoryReference,
): ConversationMemoryFacts {
  const phrase = normalizeText(reference.phrase);
  const bounded: MemoryReference = {
    ...reference,
    phrase: reference.phrase.slice(0, MEMORY_LIMITS.MAX_PHRASE_CHARS),
    sourceMessageIds: reference.sourceMessageIds.slice(0, MEMORY_LIMITS.MAX_SOURCE_MESSAGE_IDS),
  };
  const rest = facts.references.filter(
    (existing) => !(normalizeText(existing.phrase) === phrase && existing.targetId === reference.targetId),
  );
  return {
    ...facts,
    references: [bounded, ...rest].slice(0, MEMORY_LIMITS.MAX_REFERENCES),
  };
}

export function rememberAssumption(
  facts: ConversationMemoryFacts,
  assumption: MemoryAssumption,
): ConversationMemoryFacts {
  const bounded: MemoryAssumption = {
    ...assumption,
    statement: assumption.statement.slice(0, MEMORY_LIMITS.MAX_STATEMENT_CHARS),
    sourceMessageIds: assumption.sourceMessageIds.slice(0, MEMORY_LIMITS.MAX_SOURCE_MESSAGE_IDS),
  };
  const rest = facts.assumptions.filter((existing) => existing.statement !== bounded.statement);
  return { ...facts, assumptions: [bounded, ...rest].slice(0, MEMORY_LIMITS.MAX_ASSUMPTIONS) };
}

export function rememberPreference(
  facts: ConversationMemoryFacts,
  preference: MemoryPreference,
): ConversationMemoryFacts {
  const bounded: MemoryPreference = {
    ...preference,
    value: preference.value.slice(0, MEMORY_LIMITS.MAX_STATEMENT_CHARS),
    sourceMessageIds: preference.sourceMessageIds.slice(0, MEMORY_LIMITS.MAX_SOURCE_MESSAGE_IDS),
  };
  const rest = facts.preferences.filter((existing) => existing.key !== bounded.key);
  return { ...facts, preferences: [bounded, ...rest].slice(0, MEMORY_LIMITS.MAX_PREFERENCES) };
}

/**
 * Removes every fact whose evidence has been deleted. M13 requires "delete
 * memory when source messages are deleted" — a fact that can no longer point
 * at the turn it came from is exactly the opaque, uncorrectable summary this
 * model was designed to avoid, so it goes rather than losing its citation.
 */
export function forgetSourceMessages(
  facts: ConversationMemoryFacts,
  deletedMessageIds: readonly string[],
): ConversationMemoryFacts {
  const deleted = new Set(deletedMessageIds);
  const keep = <T extends { sourceMessageIds: string[] }>(fact: T): boolean => {
    const surviving = fact.sourceMessageIds.filter((id) => !deleted.has(id));
    if (surviving.length === 0) return false;
    fact.sourceMessageIds = surviving;
    return true;
  };
  return {
    references: facts.references.map((r) => ({ ...r })).filter(keep),
    assumptions: facts.assumptions.map((a) => ({ ...a })).filter(keep),
    preferences: facts.preferences.map((p) => ({ ...p })).filter(keep),
  };
}

/** Renders a surviving reference as the plain-language statement sent to the provider. */
export function describeReference(reference: MemoryReference, target: IndexedTarget | undefined): string {
  const where = target?.label ?? reference.targetId;
  const value = reference.recordedValue === null ? "" : ` (currently "${reference.recordedValue}")`;
  return `"${reference.phrase}" refers to ${where}${value}`;
}
