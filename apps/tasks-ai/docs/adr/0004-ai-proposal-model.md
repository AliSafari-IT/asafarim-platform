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
