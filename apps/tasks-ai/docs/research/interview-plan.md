# TasksAI — Validation & Interview Plan (M00)

**Status:** Ready to run (execution continues alongside M01–M02) · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

## Objective

Confirm the product contract in [charter.md](../charter.md): the ICP is reachable, the jobs-to-be-done are painful and unaddressed, the proposal-only AI model is trusted, and 3–5 teams will commit as design partners.

## Sample

- **15 target-user interviews**, 45 min each, across 5–50-person agencies, consultancies, and product teams in Belgium + NL/FR/DE/LU.
- Roles: delivery lead / team lead / founder-operator (buyer) + 1–2 individual contributors per team where possible.
- Recruit via: personal network, ASafarIM audience, 2 local founder/agency communities, targeted LinkedIn outreach. Track in the partner tracker (below).

## Interview guide (abridged)

1. Walk me through the last time work from a call or meeting got dropped or delayed. What happened? Cost?
2. Show me where that work lives today. (Observe tools, not claims.)
3. How does work get from "someone said it" into your tracker? Who does it, when, how long?
4. How do you plan your week across projects? What's painful?
5. When something slips, how and when do you find out?
6. Last time work moved in/out of a tool — how did that go?
7. Show a static mock of a proposal diff. Would you trust this? What would have to be true? What must AI never do?
8. If this existed and worked, what would you pay per user per month? What would make it a no?

## Synthesis

- Log every interview into `research/synthesis/<date>-<team>.md` from the template.
- Weekly rollup: pain frequency × severity grid; quote bank per job-to-be-done; objection list; pricing responses; trust conditions for AI.
- Decision output: keep / adjust / cut each job-to-be-done and each MVP boundary; confirm or revise pricing hypotheses; list AI hard-prohibitions confirmed by users (fold into [ADR-0004](../adr/0004-ai-proposal-model.md)).

## Design-partner commitments

Target 3–5 teams agreeing (in writing, informal) to: fortnightly feedback calls through M13, use TasksAI for at least one real project from M03, and a reference conversation. Tracked in `research/partner-tracker.md` (columns: team, size, type, contact, stage [contacted / interviewed / committed / declined], notes).

## Ethics & consent

- Interviews: verbal consent to notes; no recording without explicit opt-in; no PII beyond contact in the tracker.
- Beta (M13) has separate written consent and beta terms — see [compliance/decisions.md](../compliance/decisions.md).

## Exit for M00

- ≥8 of 15 interviews completed (remaining scheduled), OR clear signal to adjust ICP.
- Synthesis rollup v1 written.
- ≥3 design partners at "committed".
- Pricing responses recorded (not a committed price).
