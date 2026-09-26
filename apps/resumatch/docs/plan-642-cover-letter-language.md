# Plan — #642: cover letter in a chosen language

Part of epic #643. #640 (language bar) and #641 (CV language, PR #645) are
merged; #641 is the pattern to follow: **reuse its code, don't duplicate it.**
Read [agent-notes.md](agent-notes.md) first.

## Already in place (from #641)
- `lib/tailoring/language.ts`: `OUTPUT_LANGUAGES` (`en | nl | fr | de`),
  `isOutputLanguage`, `outputLanguageFromLocale`, `PROMPT_LANGUAGE_NAMES`,
  `LANGUAGE_LABELS`, `appliedOutputLanguage`, `templateLabels`. Extend this
  file; don't add a second enum.
- CV prompt language rule: `lib/tailoring/ai/prompts.ts` (`languageRule`,
  `buildSystemPrompt`; version bumped in `lib/tailoring/ai/registry.ts`).
- `app/tailor/TailorFlow.tsx`: "CV language" select (state `cvLanguage`,
  defaulting to the page locale). It's sent as `outputLanguage` to
  `/api/tailor/generate-preview`, which records it on
  `TailorPreview.outputLanguage`. `generate-confirm` then copies it to
  `TailoredResume.outputLanguage` via `appliedOutputLanguage()`.
- `app/components/app/LanguageBadge.tsx` and the `.rx-pill--lang` /
  `.rx-lang-note` styles.

## Steps
1. **Prompt:** `lib/tailoring/ai/coverLetter/prompts.ts`. Add an optional
   `outputLanguage` to `renderCoverLetterPrompt`, as a closed enum like
   tone/length (#455). Append a language rule to the system prompt, include
   it in the `cacheKey` hash, and bump `COVER_LETTER_PROMPT_VERSION`
   (`coverLetter/registry.ts`). What the rule says:
   - Greeting, paragraphs and sign-off are in that language, following its
     conventions:
     - NL: "Geachte heer/mevrouw" … "Met vriendelijke groet"
     - FR: "Madame, Monsieur," … "Veuillez agréer, Madame, Monsieur, …"
     - DE: "Sehr geehrte Damen und Herren" … "Mit freundlichen Grüßen"
   - It never invents a fact, and names, numbers and dates keep their exact
     values.
2. **Generation:** thread the language through
   `lib/tailoring/ai/coverLetter/generate.ts` (`runCoverLetterProviderCall`).
3. **Preview route** (`app/api/tailor/generate-preview/route.ts`): pass the
   language to the cover-letter call. It defaults to the CV's language (the
   same `cvLanguage`). Optionally add a separate cover-letter language select
   next to Tone/Length in `TailorFlow.tsx`, defaulting to the CV language.
   Record it server-side, e.g. `TailorPreview.coverLetterOutputLanguage`.
4. **Database:** add a nullable `CoverLetter.outputLanguage String?` and the
   `TailorPreview` column, as a hand-written additive migration.
   `generate-confirm` sets it only when applied (null for a degraded letter).
   Remind the owner to run
   `pnpm --filter @asafarim/resumatch db:migrate:deploy`.
5. **Quality check:** `lib/tailoring/coverLetterQuality.ts` treats
   "Dear Hiring Manager" as the honest no-name greeting. Make it
   language-aware (accept each language's no-name greeting) and pass the
   language wherever it's computed.
6. **Exports and UI:** `lib/tailoring/coverLetterDocx.ts` and
   `app/cover-letter/[id]/preview` follow the letter's language (fixed labels,
   `lang=` on the letter element). Show a `LanguageBadge` wherever cover
   letters are shown or listed.
7. **Tests** (vitest `*.test.ts` under `lib/` or `app/`):
   - the prompt per language combined with tone/length (distinct cache keys,
     and no rule when omitted);
   - the greeting check per language;
   - the applied/degraded rule.

## Done when
- A normal PR is open with `Closes #642 · Part of #643`. Its description
  covers what's translated vs. kept verbatim, the migration command, and how
  it was verified.
- `tsc` and all ResuMatch tests pass.
- One real browser run is done (Dutch or French, "Also draft a cover letter"
  checked, on a test job), checking the letter's language, the greeting and
  sign-off conventions, the quality checklist, the preview, and the DOCX
  export.
