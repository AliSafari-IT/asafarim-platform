# TasksAI — Accessibility (M11)

Target: **WCAG 2.2 AA** for the critical journeys (onboarding, create
project, capture/organize/complete tasks, review an AI proposal, read the
focus/analytics views).

## What's in place

| Area | Implementation |
|---|---|
| Skip link | `<a href="#ta-main" class="ta-skip">` first in `<body>`; visible on focus; `#ta-main` wraps all page content and is `tabIndex={-1}` so focus lands there. |
| Keyboard | Command palette is ⌘K/Ctrl-K, arrow-navigable, Escape-closable. Task list checkboxes, view tabs (`role="tab"` + `aria-selected`), and the proposal-diff toggles are all native inputs/buttons. Drag/drop has a keyboard alternative (position edit in the task detail panel; board move buttons). |
| Focus visibility | `:focus-visible { outline: 2px solid … }` app-wide; no `outline:none` without a replacement. |
| Screen reader | Live regions: autosave status (`aria-live="polite"`), offline banner (`role="status"`), form errors (`FieldError` from `@asafarim/ui`). Dialogs (`role="dialog"` `aria-modal` `aria-label`) for the command palette and task drawer. Icon-only controls carry `aria-label` (e.g. `task.complete` → "Complete {title}"). |
| Contrast | Colours come from `@asafarim/ui` tokens (AA-checked there). App accents (`#1f6feb`, `#b3261e`, `#8a6d00`) used on token surfaces. |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` disables transitions/animations and slide-ins. |
| Zoom / reflow | Workspace grid collapses at 820px; diff/board scroll inside their own `overflow-x:auto` container so the page body never scrolls horizontally at 200%. Relative units throughout. |
| Accessible data-viz | Analytics uses a semantic `<table>` with `<th>` headers and text values, not a canvas; metric tiles are labelled text. Focus factors are a labelled list, not a chart. |
| Localization | Copy externalized (`lib/i18n/messages.ts`), launch locales en/nl/fr, `lang` on `<html>`. |

## Verification plan (not yet run — needs a staging cut)

1. Automated: `axe-core` pass on each critical route (harness stub exists in `e2e/`).
2. Keyboard-only walk of each critical journey.
3. Screen-reader pass (NVDA + VoiceOver) of onboarding + proposal review.
4. 200% zoom + 320px-wide viewport reflow check.
5. Independent review — **no unresolved critical issues** is the M11 exit gate.

## Known gaps to close before the exit gate

- `axe` route sweep wiring in CI.
- Roving-tabindex on the board columns (currently each card is a tab stop).
- Translated `aria-label`s (keys exist; components still read English constants in a few places).
