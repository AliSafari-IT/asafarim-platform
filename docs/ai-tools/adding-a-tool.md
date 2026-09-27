# Adding a tool to the AI Workbench

Part of [#672](https://github.com/AliSafari-IT/asafarim-platform/issues/672).
Read the [charter](./charter.md) first: a tool needs a specific user job
(§3) and enters the Workbench as an `experiment` (§4.1).

## The files

A new tool touches exactly these places in `apps/web`:

| # | File | What you add |
|---|---|---|
| 1 | `lib/tools/types.ts` | The slug in `TOOL_SLUGS`. |
| 2 | `content/tool-fixtures/<slug>.ts` | Synthetic example input and its prepared result. No real or private data. |
| 3 | `content/tools.ts` | The catalogue entry: copy, lifecycle, limits, limitations, privacy statement, related app, review date. |
| 4 | `lib/tools/<slug>/` | The result type, a result view, and a `"use client"` workbench that composes `ToolWorkbench`. |
| 5 | `app/tools/[slug]/workbenches.tsx` | One line mapping the slug to the workbench. |
| 6 | Tests next to the code in step 4 | The result view and any mapping or export logic. |

You do not write a page, metadata, headings, disclosures, or a limitations
section. `app/tools/[slug]/page.tsx` renders every tool inside `ToolShell`,
which reads all of that from the catalogue entry.

## What stops you getting it wrong

- **Missing or inconsistent registry data fails the build.**
  `lib/tools/catalogue.ts` runs `validateCatalogue` when it is imported, so
  `next build` and every test that loads the catalogue fail on problems like
  these:
  - a duplicate slug, or a slug missing from `TOOL_SLUGS`;
  - no example input or output, or an example that breaks the tool's own
    limits;
  - an empty privacy statement or no limitations;
  - a lifecycle that disagrees with `indexable`
    (experiment/retired → `false`; beta/stable/paused → `true`);
  - `stable` without a case study;
  - a future `lastReviewed`, or a clash in featured order;
  - a non-plain value (function, component, class instance) anywhere in the
    entry.
- **A slug without a workbench fails typecheck.** `toolWorkbenches` is a
  `Record<ToolSlug, …>`, so it has to have an entry for every slug.
- **Disclosures can't be skipped.** Only the workbench comes from the tool.
  The AI-use notice, privacy statement, secrets warning, limitations, and
  review date are rendered by the shell and the shared `ToolWorkbench`.
- **Error states can't show a result.** `ToolRunOutcome` only carries a
  result on `success`/`degraded`, and `ToolOutcome` only renders one in those
  states. A `fixture` result is always labelled as a prepared example.
- **URLs can't select arbitrary code.** The route has `dynamicParams = false`
  and resolves slugs through the catalogue and the closed workbench map.

## What never goes in the catalogue

Provider keys, prompts, model names meant as configuration, component
references, or anything a visitor typed. The catalogue is effectively public:
catalogue cards, metadata, and later Showcase all read it.

## Runners

Until the server execution boundary lands (#673), use `createFixtureRunner`.
It returns the prepared result for the example input and reports "live
generation isn't available" for anything else. It never makes up a result
for the visitor's text.

## Checking your tool

```bash
pnpm --filter @asafarim/web test
pnpm --filter @asafarim/web typecheck
pnpm --filter @asafarim/web dev   # then open /tools/<slug>
```

Internal tools (`internal: true`, like `shell-reference`) are served only
outside production and are never listed. Use one when you need a page to
exercise the shell without shipping a public tool.
