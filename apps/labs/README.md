# ASafarIM Labs

Experimental workbench — labs.asafarim.com (local dev: `http://localhost:3011`).

> Showcase explains what ASafarIM has built. Labs lets visitors interact with what ASafarIM is
> exploring next.

## Structure

- `app/` — routes: `/`, `/experiments`, `/experiments/[slug]`, `/ideas`, `/changelog`, `/about`, `/api/status`
- `lib/experiments/registry.ts` — typed, static experiment registry (source of truth for the catalogue)
- `fixtures/` — static data used by experiments (e.g. `eval-runs.json` for the AI Evaluation Explorer)

## Launch experiments

1. **Timeline Layout Lab** (`/experiments/timeline-layout`) — one dataset, four layouts (vertical, horizontal, roadmap, storytelling card).
2. **ASafarIM UI Playground** (`/experiments/ui-playground`) — visual testbench for shared design tokens across viewports and pseudo-states.
3. **AI Evaluation Explorer** (`/experiments/ai-eval-explorer`) — static multi-model fixture comparison (latency, token efficiency, hallucination markers, formatting adherence).

## Adding a new experiment

1. Add an entry to `experiments` in [`lib/experiments/registry.ts`](lib/experiments/registry.ts).
2. Create `app/experiments/<slug>/<ComponentName>.tsx` exporting the canvas component.
3. Register `ComponentName` in the `COMPONENTS` map in [`app/experiments/[slug]/page.tsx`](app/experiments/[slug]/page.tsx).

Every experiment automatically gets the standard workspace shell (header bar, canvas, optional
control drawer, and the four-part technical accordion) via `ExperimentShell`.

## Dev

```bash
pnpm --filter @asafarim/labs dev
```
