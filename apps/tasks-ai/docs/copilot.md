# TasksAI — AI copilot from intent to approved plan (M07)

Builds the review UX on top of the M06 boundary. The human stays the author.

## Flow

`/w/{slug}/copilot` → pick what (turn notes into a plan / decompose / draft
acceptance criteria / summarize a thread) + a target project → paste text →
**Generate proposal**. The proposal renders as a diff; nothing is created
until you apply.

- **Proposal diff** (`components/ai/ProposalDiff.tsx`, logic in
  `lib/ai/diff.ts`): operations grouped **create / update / link**. Per-item
  accept toggle (partial accept), inline title edit, a `cited` / `assumption`
  badge with the confidence %. Intra-proposal duplicate hints ("possible
  duplicates: …") from `duplicateHints()`.
- **Apply**: `POST .../ai/proposals/{id}/apply` with the selected indices and
  (when edited) the edited operations. >15 ops or any edit → `?confirm=high`
  (elevated confirmation, ADR-0004). Transactional, captures an undo plan.
- **Regenerate / Reject / Undo**: reject changes nothing and records
  `outcome: "rejected"` feedback; undo replays the inverse plan.
- **Feedback** (`lib/ai/feedback.ts`): after apply, a quick trust (1–5) +
  minutes-saved prompt. `POST .../ai/proposals/{id}/feedback` also takes
  `editDistance`, `correctionReason`, `outcome`.

## Metrics (`GET .../ai/metrics`)

30-day aggregate for the KPI dictionary: proposals generated / applied,
acceptance rate, avg edit distance (`lib/ai/diff.ts` `editDistance`, 0 =
applied verbatim), avg time saved, avg trust, cost, and the list of
correction reasons.

## Guardrails (unchanged from M06, enforced structurally)

AI never auto-sends messages, deletes records, assigns people, or changes
committed dates — those operations do not exist in the schema. Every
generated fact links to a source span or is flagged an assumption.
Regeneration re-submits the (never-stored-verbatim) input.

## Schema

`ProposalFeedback` (migration `20260906001808`): outcome, editDistance,
timeSavedMin, correctionReason, trust.
