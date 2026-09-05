# TasksAI — Licensing & Compliance Decisions (M00)

**Status:** Recorded at M00; each item has a named owner and a gate. · **Date:** 2026-09-06

> These are decisions and assumptions, not legal advice. Items marked **GATE** must be resolved before the milestone named.

## 1. Licensing

| Item | Decision / assumption | Owner | Gate |
|---|---|---|---|
| Repo license today | Source-available; portfolio evaluation and personal non-commercial review only. TasksAI code inherits this. | Ali Safari / ASafarIM | — |
| Commercial license | A written commercial license or a relicensing decision for the TasksAI app is **required before accepting payment or operating as commercial SaaS**. | Ali Safari / ASafarIM | **GATE: M14** |
| Third-party deps | All new deps must be permissive (MIT/Apache-2.0/BSD/ISC). Copyleft (GPL/AGPL) requires explicit review before adding. | Eng | ongoing |

## 2. Operating entity

| Item | Assumption | Owner | Gate |
|---|---|---|---|
| Legal entity | Belgian entity (or sole-proprietor bridge) to be confirmed; TasksAI operated by "ASafarIM (entity TBD)". | Ali Safari | **GATE: M14** |
| Data controller | The operating entity is **controller** for account/workspace data. | Ali Safari | M12 register |

## 3. GDPR roles

| Processing | Role | Notes |
|---|---|---|
| Account, workspace, task content | Controller (operating entity) | Users are data subjects; workspace owners are joint decision-makers on their content |
| Customer-invited guests' data | Controller | Minimal data (email, name) |
| AI provider processing of prompt context | Processor (provider) under DPA; TasksAI remains controller | No-training contractual term required |
| Object storage (attachments) | Processor (`@asafarim/storage` backend) | EU region required |

DSAR, export, and deletion workflows: designed in M05 (export/deletion manifests), verified end-to-end in M12.

## 4. AI Act classification (assumption)

| Question | Assumption | Basis | Gate |
|---|---|---|---|
| Risk tier | **Limited/minimal risk.** TasksAI AI features draft and summarize text and propose task structures; a human reviews and applies every change ([ADR-0004](../adr/0004-ai-proposal-model.md)). | No biometric, no employment-decision, no scoring of individuals; proposal-only. | Re-assess at M13 and before any feature that ranks or evaluates people (out of scope, [charter.md](../charter.md) §5) |
| Transparency | AI-generated content is labelled as such in-product; users told when they interact with AI output. | AI Act transparency obligations | M07 |
| Prohibited uses | Employee scoring/ranking, emotion recognition, keystroke monitoring, automated employment decisions — **prohibited by product policy**, enforced in code (M08/M10). | Alignment with AI Act prohibited/high-risk categories | M08, M10 |

## 5. Subprocessors (initial list, finalized M12)

| Subprocessor | Purpose | Region intent |
|---|---|---|
| Hosting (Hostinger VPS, existing platform infra) | App + DB + Redis hosting | EU |
| AI provider — Anthropic | AI proposal generation | EU/US; DPA + no-training term; least-data prompts, redaction ([ADR-0004]) |
| AI provider — OpenAI | AI proposal generation (alt) | EU/US; same terms |
| Object storage backend (`@asafarim/storage`) | Attachment storage | EU region |
| Email/SMTP (existing platform) | Notifications, digests, OTP | EU |
| Stripe (from M14, test-mode until launch) | Billing | EU entity where available; DPA |

Each requires a signed DPA and SCCs where data leaves the EEA — assembled in M12.

## 6. Data residency intent

- Primary data (Postgres, Redis, attachments): **EU**.
- AI prompt context may transit to a provider region under DPA; minimized and redacted; no training.
- Enterprise data-location options: M15, evidence-gated.

## 7. Retention (stub — finalized M12)

See [event-taxonomy.md](../research/event-taxonomy.md) §Retention. Account data deleted within 30 days of verified workspace deletion request; backups rotate within 35 days; audit/security events retained longer per legal need.

## 8. Sign-off

Owners above accept these as the working posture for M01–M11. GATE items block their named milestone. Reviewed at M12 (hardening) and M13 (beta terms).
