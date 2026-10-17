/**
 * Extractor identity constants, stamped on every `CandidateProfileVersion`
 * as `extractorName` / `extractorVersion` (issue #523).
 *
 * Kept in this dependency-free module (no `server-only`, no parser code) so
 * the stale-version report (`lib/extraction/staleVersions.ts`, run from a
 * plain `tsx` CLI) can read the current values without loading the PDF/DOCX
 * stack. `text.ts` and `profileExtractor.ts` re-export them, so existing
 * imports keep working.
 *
 * WHEN TO BUMP A VERSION — the rule every extraction change follows:
 *
 * - Bump when a change can make the SAME input bytes produce DIFFERENT
 *   stored output: a bug fix in parsing, a new or removed field, a changed
 *   heuristic, a different confidence score, different text normalisation.
 *   A correctness fix is exactly the case that must bump: without it, every
 *   profile extracted by the buggy code looks identical to a fixed one, and
 *   the stale-version report cannot find it.
 * - Do NOT bump for changes that cannot alter output: refactors with
 *   identical results, logging, comments, performance, error messages.
 * - Bump the constant of the layer you changed, and only that one:
 *   `EXTRACTOR_VERSION` for the text layer (`text.ts`, `pdfLayout.ts`),
 *   `PROFILE_EXTRACTOR_VERSION` for the rule-based profile extractor
 *   (`profileExtractor.ts`), `EXTRACT_PROMPT_VERSION` (in `ai/prompts.ts`)
 *   for the AI extraction prompt or its output handling. A model change is
 *   tracked by `EXTRACT_MODEL_VERSIONS` (in `ai/registry.ts`).
 * - Semver for the two rule-based constants: patch for a fix, minor for
 *   new output, major for a contract change. The prompt version is
 *   `extract_profile@<n>`, incremented by one.
 *
 * Bumping never rewrites old rows. Old versions keep their stamp, and the
 * report lists them. Re-extraction is opt-in only (see staleVersions.ts).
 */

/** The text layer (PDF/DOCX/plain text → reading-order text). */
export const EXTRACTOR_NAME = "resumatch-local-text";
export const EXTRACTOR_VERSION = "1.0.0";

/** The rule-based profile extractor (text → draft profile). The AI path
 *  stamps `${PROFILE_EXTRACTOR_NAME}-ai`. */
export const PROFILE_EXTRACTOR_NAME = "resumatch-rules";
export const PROFILE_EXTRACTOR_VERSION = "1.0.0";
