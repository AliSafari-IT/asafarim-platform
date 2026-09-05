# TasksAI — Product Charter (M00)

**Status:** Draft for sign-off · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM (operating entity TBD)
**Technical id:** `tasks-ai` / `@asafarim/tasks-ai` · **Domain:** `tasks-ai.asafarim.com` · **Dev port:** 3013

> This charter is the product contract for TasksAI: who it serves, which workflow it owns, what AI may do, and what must be true before commercial operation. It contains no feature implementation and makes no production claims. It supersedes the placeholder Showcase copy that previously described Task Management as an inherited beta.

## 1. Problem and thesis

Client-service and product teams of 5–50 people lose execution fidelity in the gap between **intent** (a call, a brief, a Slack thread, a meeting) and **tracked work**. Intent is captured as prose in five tools; someone re-types it into tasks days later, losing owners, dates, dependencies, and the "why". Existing task tools are either too heavy (Jira), too flat (spreadsheets, Todoist), or add AI as a novelty bolt-on that nobody trusts to touch real commitments.

**Thesis:** a calm, fast, keyboard-first task manager that is *already useful with zero AI*, plus a **proposal-only** AI copilot that turns unstructured intent into an editable, fully audited work graph — with the human always the author — wins trust that autonomous "AI project managers" cannot.

**Working promise:** *From scattered intent to trusted execution.*

## 2. Ideal customer profile (ICP)

| Dimension | In profile | Out of profile (for now) |
|---|---|---|
| Team size | 5–50 people | Solo; >200; whole-enterprise rollout |
| Type | Agencies, consultancies, product/delivery teams | Field ops, manufacturing, personal GTD |
| Geography | Belgium + neighboring EU (NL, FR, DE, LU) | US-first, APAC |
| Buyer | Team lead / delivery lead / founder-operator | Central IT procurement, PMO |
| Pain trigger | Recurring "we dropped that" incidents; status meetings that exist only to reconstruct state | Teams already deep in a working Jira/Linear setup |
| Data posture | Cares about EU data residency, no-training AI | Indifferent to where data lives |

**Design partners:** recruit 3–5 from this profile before M01 build sign-off is considered validated (interviews continue in parallel with M01–M02). See [research/interview-plan.md](research/interview-plan.md).

## 3. Jobs to be done

1. *When a call or brief ends,* capture the resulting work in seconds so nothing depends on memory.
2. *When I plan the week,* see everything that's mine, what's overdue, and what's blocked — across projects — in one place.
3. *When a task is vague,* break it into concrete steps with owners and acceptance criteria without a 30-minute meeting.
4. *When something slips,* know early, with the dependency chain and the evidence, not at the status meeting.
5. *When work enters or leaves the tool,* move it without lock-in (import, export, portable formats).
6. *When AI proposes changes,* review a clear diff, edit it, accept part of it, and undo it — never have it act on its own.

## 4. Positioning

**For** delivery-focused teams of 5–50 **who** lose work in the gap between conversations and tracking, **TasksAI is** an AI-native work execution tool **that** turns unstructured intent into an editable, audited plan while staying fast and useful without AI. **Unlike** Jira (heavy), spreadsheets (flat), and "autonomous AI PM" tools (untrusted), **TasksAI** keeps the human as author and every AI change as a reviewable proposal.

Naming risk: generic "Tasks AI" / "TaskAI" strings are used by unrelated products. A trademark + search-confusion review is a tracked risk ([risk-register.md](risk-register.md), R-01) and a gate before M14 public launch, not before build.

## 5. MVP boundaries

**In (M01–M05, non-AI core):** workspaces, projects, tasks + hierarchy, dependencies, estimates, dates, assignees, labels, custom fields, recurrence, templates, bulk actions; Inbox / My Work / List / Board / Calendar / Timeline views on one saved-view model; command palette, quick capture, undo; invitations, comments, mentions, attachments, notifications, SSE realtime; global search; CSV/JSON import-export; workspace data export + deletion.

**In (M06–M08, AI, proposal-only):** provider-neutral AI boundary with fixture provider, evals, quotas, kill switch; intent→plan copilot with source citations and proposal diffs; explainable focus ranking and risk/workload briefs with per-factor transparency and overrides.

**In (M09–M12):** rules/automations engine, scoped API tokens + webhooks, GitHub integration; goals/cycles/time/portfolio analytics; PWA + WCAG 2.2 AA + en/nl/fr + performance budgets; security/privacy/admin/reliability hardening.

**Out (explicit non-goals):** autonomous task allocation; employee scoring, ranking, emotion/keystroke analysis, or automated employment decisions; AI auto-sending messages or deleting/assigning without confirmation; billing before the commercial-license gate; production/launch claims before M14; speculative competitor importers beyond CSV/JSON + one evidence-led adapter.

## 6. Pricing hypotheses (to validate, not commit)

| Tier | Hypothesis | Notes |
|---|---|---|
| Free | Up to 3 members, 2 projects, no AI | Activation + virality |
| Pro | ~€8/user/mo — full core + metered AI allowance | Primary revenue |
| Business | ~€14/user/mo — automations, integrations, analytics, larger AI allowance | Team buyer |
| Enterprise | Custom — SAML/SCIM, audit streaming, data-location options | M15, evidence-gated |

AI and automation usage is **metered per workspace** with visible budgets and no surprise overage charges (enforced from M06). Willingness-to-pay tested in M13.

## 7. KPI dictionary and event taxonomy

Defined in [research/kpi-dictionary.md](research/kpi-dictionary.md) and [research/event-taxonomy.md](research/event-taxonomy.md). Both are approved as part of M00 sign-off and feed the `ActivityEvent` / `OutboxEvent` model in M02.

## 8. Architecture decisions

Recorded as ADRs, all approved at M00:

- [ADR-0001](adr/0001-dedicated-database.md) — dedicated TasksAI PostgreSQL database
- [ADR-0002](adr/0002-tenant-model.md) — row-level `workspaceId` tenant model
- [ADR-0003](adr/0003-api-first-boundary.md) — API-first `/api/v1` boundary
- [ADR-0004](adr/0004-ai-proposal-model.md) — proposal-only AI mutation model
- [ADR-0005](adr/0005-event-outbox-strategy.md) — transactional activity + outbox events

## 9. Licensing and compliance posture

Recorded in [compliance/decisions.md](compliance/decisions.md): source-available repository today; a **written commercial license or relicensing decision is a hard gate before M14** (accepting payment / operating as commercial SaaS). GDPR roles, AI Act classification assumption, subprocessors, data-residency intent, and retention schedule stub are captured there, each with a named owner.

## 10. Exit evidence for M00

See [charter-signoff.md](charter-signoff.md). In summary: signed charter; interview plan + synthesis template ready; design-partner tracker; risk register; approved KPI + event taxonomy; license/compliance decisions with owners; explicit go for M01.
