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

## Where the tool shows up

Once the catalogue lists at least one public tool (one that isn't internal
or retired), these entry points turn on automatically:

- the card on `/tools`;
- the "Tools" item in the primary nav;
- the homepage AI Tools link;
- the `/tools` entry in the sitemap.

Before that, `/tools` shows an empty state and is `noindex`. Cards take
their order from `featuredOrder`, and their availability badge from
`lifecycle` + `liveGeneration`: "Runs on your text", "Examples only", or
"Paused". Leave `liveGeneration: false` until the tool has a `live`
adapter spec and has passed its eval gate (#679). Catalogue and card wording lives under `web.tools.*` in
`lib/i18n-dictionaries.ts`, and every locale must have every key (a test
checks this).

## What never goes in the catalogue

Provider keys, prompts, model names meant as configuration, component
references, or anything a visitor typed. The catalogue is effectively public:
catalogue cards, metadata, and later Showcase all read it.

## Running on the server

Every tool runs through the server execution boundary (see
[execution-boundary.md](./execution-boundary.md)). Two more files per tool:

| # | File | What you add |
|---|---|---|
| 7 | `lib/tools/server/adapters/<slug>.ts` | A `ToolAdapter`: input and output Zod schemas, a deterministic `fixture`, `exampleInput`, `limits` (bytes, timeout, output tokens, cost ceiling), and optionally a `live` spec (prompt version, output JSON Schema, `buildPrompt`). |
| 8 | `lib/tools/server/adapters/index.ts` | One line mapping the slug to the adapter (`Record<ToolSlug, …>`, so a missing adapter fails typecheck). |

In the workbench (step 4), use `createServerRunner(slug, { exampleText,
toInput })`. The catalogue example goes out as `mode: "example"` and is
always served from the fixture. Anything else is a live request, which the
server answers with the fixture in `AI_TOOLS_MODE=fixture`, or reports as
"live generation isn't available" until live is enabled.

## Checking your tool

```bash
pnpm --filter @asafarim/web test
pnpm --filter @asafarim/web typecheck
pnpm --filter @asafarim/web dev   # then open /tools/<slug>
```

Internal tools (`internal: true`, like `shell-reference`) are served only
outside production and are never listed. Use one when you need a page to
exercise the shell without shipping a public tool.
