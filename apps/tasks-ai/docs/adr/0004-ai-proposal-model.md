# ADR-0004 — Proposal-only AI mutation model

**Status:** Accepted (M00) · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

## Context

The product thesis ([charter.md](../charter.md)) is that trust is won by keeping the human as author. Autonomous "AI project manager" behavior is an explicit non-goal. We need a single, enforceable rule for how AI is allowed to affect user data, that holds across M06 (boundary), M07 (copilot), M08 (intelligence), and M09 (automations).

## Decision

**AI never mutates domain data directly.** Every AI-originated change is a **Proposal**:

1. AI output is validated against a Zod schema describing a set of **allowed operations** (`create`, `update`, `link`, `unlink`) on an allowlist of entity types and fields. Anything outside the allowlist is rejected before it reaches the user.
2. A Proposal is rendered as a **diff grouped by operation** (create / update / link). Each proposed fact carries a **source citation** (span in the input text or the queried record) or is explicitly marked **assumption**, plus a confidence value.
3. The user can edit, partially accept, reject, regenerate, and — after applying — **undo**. Rejection applies nothing. Applying is idempotent (same Proposal id applied twice = one effect).
4. Applying a Proposal writes an `AuditEvent` (actor = user, on behalf of = model+prompt version, inputs hash, operations) and stores an **undo plan** (inverse operations) with the Proposal.
5. **Hard prohibitions**, enforced in code, not prompt: AI may never send messages/notifications, delete records, assign or unassign people, change committed dates, change roles/permissions, or touch billing. High-blast-radius changes (bulk updates over a threshold, cross-project links) require an elevated confirmation step.
6. Automations (M09) that invoke AI are bound by the same allowlist and still produce Proposals unless the workspace owner has explicitly enabled a specific low-risk auto-apply rule with its own audit trail and per-run cap.

Blast-radius limits (max entities per Proposal, max linked projects, max field changes) are configurable per workspace with safe defaults, defined in M06.

## Consequences

**Positive:** one rule to test and explain; prompt injection cannot widen scope beyond the allowlist; AI can be fully disabled (kill switch, M06) without breaking core task management; every AI effect is reproducible from versioned evidence.

**Negative:** no "just do it" ergonomics; more UI (diff review) per AI feature; regeneration cost. Accepted as the core differentiator. Latency of review is mitigated by good diff UX and partial-accept.

## Addendum (issue #235) — widening the operation allowlist

The original allowlist (`create_task`, `update_task`, `link_tasks`) was deliberately tiny, but too tiny to represent the everyday structuring a human then does by hand after every AI-generated plan: labelling, a status nudge, a dependency edge, a due-date suggestion. Four operations were added — `set_labels`, `suggest_status`, `set_dependency`, `suggest_due_date` — without relaxing any of the rules above:

- Every new operation is still preview-only: it appears in the same diff, needs the same explicit apply, and is subject to the same blast-radius/`?confirm=high` gate as the original three.
- Applying any of them still writes a `proposal.applied` `AuditEvent` and an inverse `undoPlan` step, in the same transaction as everything else in the proposal (`lib/ai/proposals.ts`).
- `set_labels` is the one operation among the four that is a normal, confirmed change (add/remove `TaskLabel` rows) — no different in kind from `update_task`'s title/description, because the human already confirmed it by approving the op in review.
- `suggest_status` and `suggest_due_date` are deliberately **not** confirmed changes to the committed fields: they write to separate `Task.suggestedStatusId` / `Task.suggestedDueDate` columns. `Task.statusId` / `Task.dueDate` are never touched by applying a proposal — promoting a suggestion to the committed value is a distinct human action outside this pipeline. This keeps the ADR's "AI never writes a committed date" and "never changes status" prohibitions literally true: the schema has no path from a proposal to those columns.
- `set_dependency` is a `link_tasks` superset that also accepts the inverse direction (`blocked_by`), so a draft can express "this is blocked by that" without a workaround. It resolves to the same `TaskRelation` table and the same `kind="blocks"` row as `link_tasks`.
- The hard prohibitions are unchanged and still hold by construction: none of the four new operations' schemas has a field for an assignee, a message/notification, a delete, or (critically) the *committed* status/due-date column. Prompt injection cannot request what does not exist in the schema — verified directly in `lib/ai/guard.test.ts`.
- A `link_tasks`/`set_dependency` endpoint may now also be a retrieved-candidate ref (`"task:<id>"`, issue #234) naming an already-existing task outside the proposal — resolved only against the retrieval set computed at generation time, both in `guardDraft` and independently again at apply time.
