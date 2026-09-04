/**
 * Re-exported from lib/shared/vocabulary.ts.
 *
 * The controlled vocabularies (JM-036) turned out not to be an eligibility
 * concern alone: ingestion needs the same folding to compute a stable
 * employer key, and duplicating the logic in two places is how the two
 * copies quietly drift apart. This file is kept so the existing import path
 * and JM-036 doc anchor stay meaningful, without a real second copy behind
 * it.
 */
export * from "../shared/vocabulary";
