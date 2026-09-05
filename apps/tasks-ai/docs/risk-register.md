# TasksAI — Risk Register (M00)

**Owner:** Ali Safari / ASafarIM · **Updated:** 2026-09-06 · Reviewed at each milestone exit.

Scoring: Likelihood (L) and Impact (I) each 1–5; Score = L×I.

| ID | Risk | L | I | Score | Mitigation | Owner | Trigger / gate |
|---|---|---|---|---|---|---|---|
| R-01 | Name/trademark collision — generic "Tasks AI"/"TaskAI" used by unrelated products; confusion or challenge | 4 | 3 | 12 | Trademark + search-confusion review; keep a fallback name; "TasksAI" one word + distinct branding | Ali Safari | **GATE: M14** (before public launch/marketing spend) |
| R-02 | Commercial-license gate slips → cannot charge, runway pressure | 3 | 5 | 15 | Start entity + license work in parallel from M06; no billing code paths enabled until resolved | Ali Safari | **GATE: M14** |
| R-03 | AI cost per workspace exceeds Pro price → negative margin | 3 | 4 | 12 | Fixture provider in CI; per-workspace quotas + budgets + kill switch (M06); least-data prompts; cache; measure cost KPI from first proposal | AI | M06 exit gate: cost within model |
| R-04 | Cross-tenant data leak (missing workspace scope, IDOR) | 2 | 5 | 10 | Repository boundary + lint rule + mandatory isolation tests per resource ([ADR-0002]); RLS layer in M12; external security test | Eng | M02 exit; M12 |
| R-05 | Prompt injection via task/comment/imported content widens AI scope | 3 | 4 | 12 | Allowlisted operations only ([ADR-0004]); untrusted content fenced, never executed as instructions; injection eval suite (M06) | AI | M06 exit gate |
| R-06 | Surveillance-misuse perception — buyers/press see it as employee monitoring | 2 | 4 | 8 | Explicit anti-metrics ([kpi-dictionary]); prohibited uses enforced in code; transparency in every signal (M08); messaging discipline | Product | M08, M13 |
| R-07 | Scope creep across 16 milestones → nothing ships usable | 4 | 4 | 16 | Non-AI core must be independently useful by M03; per-milestone exit evidence; time-boxed autonomous runs; follow-up lists over gold-plating | Product | every milestone exit |
| R-08 | Docker/local Postgres instability on dev machine blocks migrations/tests | 3 | 2 | 6 | Migrations authored regardless; DB tests gated on availability; CI uses ephemeral Postgres; documented in [../docs/deploy-plan.md] | Eng | M01 |
| R-09 | Design partners not recruited → building on assumptions | 3 | 4 | 12 | Interview plan runs from M00 through M02; adjust ICP early if signal weak; M03 gate requires ≥1 partner using it for real work | Product | M00 exit; M03 |
| R-10 | Platform SSO / cookie-domain coupling breaks other apps when registering tasksai | 2 | 3 | 6 | Additive registry entry only; test SSO round trip + regression on one other app in M01; revert path documented | Eng | M01 exit |
| R-11 | Isolated Prisma client accidentally imports/collides with platform client | 2 | 4 | 8 | Generate to `apps/tasks-ai/lib/db/generated`; env guard that target ≠ platform DB; migration script refuses platform URL ([ADR-0001]) | Eng | M01 |
| R-12 | GDPR/AI Act posture wrong (classification, residency) | 2 | 4 | 8 | Documented assumptions with owners ([compliance/decisions.md]); legal review at M12; re-assess at M13 | Ali Safari | M12 |
| R-13 | Attachment abuse — malware, illegal content, storage cost | 2 | 3 | 6 | Type/size checks, private storage, signed downloads, quarantine decision (M04), retention + takedown (M12) | Eng | M04 |
| R-14 | Realtime (SSE) scaling / connection storms | 2 | 3 | 6 | SSE-first with backoff + resume; load test in M11/M15; fallback to polling | Eng | M11 |

**Top risks to watch now:** R-07 (scope), R-02 (license/runway), R-03 (AI margin), R-01 (name).
