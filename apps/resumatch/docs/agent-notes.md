# ResuMatch — notes for agents

Practical conventions and known pitfalls for anyone (human or AI agent)
changing this app. Most were learned the hard way; each has cost a broken page
or a wasted run at least once.

## Git
- Branch from the remote without tracking it:
  `git checkout -b <branch> --no-track origin/main`.
- Run `git branch --show-current` before **every** commit and push. Other
  sessions and `gh pr merge` sometimes switch this shared checkout to `main`
  underneath you.
- Push with an explicit refspec: `git push -u origin HEAD:refs/heads/<branch>`.
  Never use a bare `git push`: a push to `main` triggers the production deploy.
- Work goes branch → commit → PR (not a draft). Only commit straight to `main`
  when the owner explicitly asks for that specific change.

## Database (ResuMatch has its own)
- ResuMatch runs its **own** Prisma schema and Postgres (`resumatch` on
  `localhost:55437`), with the client generated into `lib/db/generated`.
- Regenerate the client: `pnpm --filter @asafarim/resumatch db:generate`.
- Migrate locally: `pnpm --filter @asafarim/resumatch db:migrate:deploy`.
  The root `pnpm db:migrate:deploy` migrates the **platform** DB, not this
  one.
- A missing column shows up as a page crash with Prisma `P2022` ("column … does
  not exist"). Check what's pending (read-only) from `apps/resumatch`:
  `pnpm exec dotenv -e ../../.env.local -e ../../.env -- prisma migrate status --schema prisma/schema.prisma`.
- Write additive migrations by hand (`prisma/migrations/<timestamp>_<name>/migration.sql`)
  rather than `migrate dev`, which can offer to reset the local DB on drift.
  New columns should be nullable so existing rows keep working.

## Editing
- Files use CRLF line endings. Scripted multi-line find/replace must normalise
  `\r\n`, or it silently matches nothing. For text with backslashes or
  apostrophes, the Edit tool is safer than shell-quoted scripts.
- Never use `window.confirm` / `window.alert`; use the styled `ConfirmDialog`.
- New UI text must pass WCAG AA contrast (axe) in light **and** dark themes.
  Don't fade text with `opacity`; use `var(--muted)`.

## Build, dev server, verification
- Typecheck and tests, from `apps/resumatch`: `pnpm exec tsc --noEmit -p .` and
  `pnpm exec vitest run`.
- If `next build` fails with `ENOENT … .next/server/pages-manifest.json`, the
  `.next` folder is stale (often after a dev-server restart). Delete
  `apps/resumatch/.next` and rebuild.
- The dev server (`localhost:3012`) sometimes misses file edits made in quick
  succession. Confirm it's serving your change (computed styles, or the served
  JS/CSS) before judging the UI.
- In development, Next.js may keep a hidden (`[hidden]`) second copy of a
  streamed page in the DOM. When counting elements in a check, ignore anything
  inside `[hidden]`.
- A real tailoring run costs AI budget. Say so, and use one run on a test job
  ("Type in the details myself") rather than several.

## Tailoring invariants (don't break these)
- The model only writes prose (headline, summary, experience bullets, and the
  cover-letter body). Employer, job title, dates, education, certifications and
  skill names are copied from the confirmed profile **in code**; see
  `lib/tailoring/ai/schema.ts` → `mergeTailoringSuggestions`.
- `generate-confirm` takes provenance (prompt/model version, degraded, output
  language) from the server's `TailorPreview` row, never from the client
  (issue #525).
- Prompt choices are closed enums (tone, length, output language), never free
  text. The one exception is the profile Summary write/rewrite
  (`lib/profile/ai/prompts.ts`): the candidate may add a fenced, capped
  request (≤ 500 chars) that steers emphasis and omissions but never
  overrides the "only facts from the profile" rule. Any change to prompt wording bumps the version in the relevant
  `registry.ts` and must change the prompt's cache key.

## Done, with a written plan
- [#642 — cover letter in a chosen language](plan-642-cover-letter-language.md)
  (the CV and letter share `lib/tailoring/language.ts`; extend it for any
  new output-language work rather than adding a second enum)
